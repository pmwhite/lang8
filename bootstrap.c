/*
 * L8 bootstrap compiler (C)
 *
 * Language: C-like subset → x86-64 Linux GAS assembly
 *
 *   Types:     int (64-bit), struct Tag { int fields...; }, pointers, arrays
 *   Decls:     int x;  struct T x;  struct T *p;  T/int a[N];
 *   Control:   if/else, while, return, blocks
 *   Ops:       + - * / %  == != < <= > >=  && ||  =  & * ! -  []  .  ->  ()
 *   Other:     sizeof(struct Tag), string/char literals, // comments
 *   Runtime:   read/write/open/close/exit/malloc/loadb/storeb/syscall
 *
 * Usage:  ./l8c0 file.l8 > file.s
 * Link:   gcc -nostdlib -static -o prog file.s runtime.s
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdarg.h>

static void error(char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    fprintf(stderr, "\n");
    va_end(ap);
    exit(1);
}

static char *read_file(char *path) {
    FILE *fp = fopen(path, "r");
    if (!fp) error("cannot open %s", path);
    fseek(fp, 0, SEEK_END);
    long n = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    char *buf = malloc(n + 1);
    fread(buf, 1, n, fp);
    buf[n] = 0;
    fclose(fp);
    return buf;
}

/* ---------- tokens ---------- */

enum {
    TK_EOF, TK_NUM, TK_STR, TK_IDENT,
    TK_INT, TK_IF, TK_ELSE, TK_WHILE, TK_RETURN,
    TK_STRUCT, TK_SIZEOF,
    TK_EQ, TK_NE, TK_LE, TK_GE,
    TK_PLUS, TK_MINUS, TK_STAR, TK_SLASH, TK_PERCENT,
    TK_LT, TK_GT, TK_ASSIGN, TK_NOT, TK_AMP,
    TK_LPAREN, TK_RPAREN, TK_LBRACE, TK_RBRACE,
    TK_LBRACK, TK_RBRACK, TK_SEMI, TK_COMMA,
    TK_AND, TK_OR, TK_DOT, TK_ARROW
};

typedef struct Token {
    int kind;
    long val;
    char *str;
    int len;
    struct Token *next;
} Token;

static char *source;
static Token *token;

static int is_ident1(char c) { return isalpha(c) || c == '_'; }
static int is_ident2(char c) { return is_ident1(c) || isdigit(c); }

static Token *new_token(int kind, char *start, int len) {
    Token *t = calloc(1, sizeof(Token));
    t->kind = kind;
    t->str = start;
    t->len = len;
    return t;
}

static int kw_eq(char *s, int n, char *kw) {
    return strlen(kw) == (size_t)n && !memcmp(s, kw, n);
}

static Token *tokenize(char *p) {
    Token head = {0};
    Token *cur = &head;
    while (*p) {
        if (isspace(*p)) { p++; continue; }
        if (p[0] == '/' && p[1] == '/') {
            while (*p && *p != '\n') p++;
            continue;
        }
        if (p[0] == '/' && p[1] == '*') {
            p += 2;
            while (*p && !(p[0] == '*' && p[1] == '/')) p++;
            if (*p) p += 2;
            continue;
        }
        if (isdigit(*p)) {
            char *s = p;
            long v = strtol(p, &p, 10);
            cur = cur->next = new_token(TK_NUM, s, p - s);
            cur->val = v;
            continue;
        }
        if (*p == '"') {
            char *s = ++p;
            while (*p && *p != '"') {
                if (*p == '\\') p++;
                p++;
            }
            cur = cur->next = new_token(TK_STR, s, p - s);
            if (*p == '"') p++;
            continue;
        }
        if (*p == '\'') {
            p++;
            long v;
            if (*p == '\\') {
                p++;
                if (*p == 'n') v = '\n';
                else if (*p == 't') v = '\t';
                else if (*p == '0') v = 0;
                else if (*p == '\\') v = '\\';
                else if (*p == '\'') v = '\'';
                else v = *p;
                p++;
            } else {
                v = *p++;
            }
            if (*p == '\'') p++;
            cur = cur->next = new_token(TK_NUM, p, 0);
            cur->val = v;
            continue;
        }
        if (is_ident1(*p)) {
            char *s = p;
            while (is_ident2(*p)) p++;
            int n = p - s;
            int kind = TK_IDENT;
            if (kw_eq(s, n, "int")) kind = TK_INT;
            else if (kw_eq(s, n, "if")) kind = TK_IF;
            else if (kw_eq(s, n, "else")) kind = TK_ELSE;
            else if (kw_eq(s, n, "while")) kind = TK_WHILE;
            else if (kw_eq(s, n, "return")) kind = TK_RETURN;
            else if (kw_eq(s, n, "struct")) kind = TK_STRUCT;
            else if (kw_eq(s, n, "sizeof")) kind = TK_SIZEOF;
            cur = cur->next = new_token(kind, s, n);
            continue;
        }
        if (p[0] == '=' && p[1] == '=') { cur = cur->next = new_token(TK_EQ, p, 2); p += 2; continue; }
        if (p[0] == '!' && p[1] == '=') { cur = cur->next = new_token(TK_NE, p, 2); p += 2; continue; }
        if (p[0] == '<' && p[1] == '=') { cur = cur->next = new_token(TK_LE, p, 2); p += 2; continue; }
        if (p[0] == '>' && p[1] == '=') { cur = cur->next = new_token(TK_GE, p, 2); p += 2; continue; }
        if (p[0] == '&' && p[1] == '&') { cur = cur->next = new_token(TK_AND, p, 2); p += 2; continue; }
        if (p[0] == '|' && p[1] == '|') { cur = cur->next = new_token(TK_OR, p, 2); p += 2; continue; }
        if (p[0] == '-' && p[1] == '>') { cur = cur->next = new_token(TK_ARROW, p, 2); p += 2; continue; }

        int kind;
        switch (*p) {
        case '+': kind = TK_PLUS; break;
        case '-': kind = TK_MINUS; break;
        case '*': kind = TK_STAR; break;
        case '/': kind = TK_SLASH; break;
        case '%': kind = TK_PERCENT; break;
        case '<': kind = TK_LT; break;
        case '>': kind = TK_GT; break;
        case '=': kind = TK_ASSIGN; break;
        case '!': kind = TK_NOT; break;
        case '&': kind = TK_AMP; break;
        case '.': kind = TK_DOT; break;
        case '(': kind = TK_LPAREN; break;
        case ')': kind = TK_RPAREN; break;
        case '{': kind = TK_LBRACE; break;
        case '}': kind = TK_RBRACE; break;
        case '[': kind = TK_LBRACK; break;
        case ']': kind = TK_RBRACK; break;
        case ';': kind = TK_SEMI; break;
        case ',': kind = TK_COMMA; break;
        default: error("unexpected character: %c", *p);
        }
        cur = cur->next = new_token(kind, p, 1);
        p++;
    }
    cur->next = new_token(TK_EOF, p, 0);
    return head.next;
}

static int equal(Token *t, int kind) { return t->kind == kind; }

static Token *skip(Token *t, int kind) {
    if (!equal(t, kind)) error("expected token kind %d", kind);
    return t->next;
}

static char *tokstr(Token *t) {
    char *s = malloc(t->len + 1);
    memcpy(s, t->str, t->len);
    s[t->len] = 0;
    return s;
}

static char *unescape(char *s, int n, int *out_len) {
    char *buf = malloc(n + 1);
    int j = 0;
    for (int i = 0; i < n; i++) {
        if (s[i] == '\\' && i + 1 < n) {
            i++;
            if (s[i] == 'n') buf[j++] = '\n';
            else if (s[i] == 't') buf[j++] = '\t';
            else if (s[i] == '0') buf[j++] = 0;
            else if (s[i] == '\\') buf[j++] = '\\';
            else if (s[i] == '"') buf[j++] = '"';
            else buf[j++] = s[i];
        } else {
            buf[j++] = s[i];
        }
    }
    buf[j] = 0;
    *out_len = j;
    return buf;
}

/* ---------- types ---------- */

typedef struct Member Member;
typedef struct StructDef StructDef;
typedef struct Type Type;

struct Member {
    char *name;
    int offset;
    Type *ty;
    Member *next;
};

struct StructDef {
    char *name;
    Member *members;
    int size;
    StructDef *next;
};

enum { TY_INT, TY_PTR, TY_ARRAY, TY_STRUCT };

struct Type {
    int kind;
    Type *base;
    int array_len;
    StructDef *struct_def;
    int size;
};

static StructDef *struct_defs;
static Type *ty_int;

static Type *newtype(int kind) {
    Type *t = calloc(1, sizeof(Type));
    t->kind = kind;
    return t;
}

static Type *ptr_to(Type *base) {
    Type *t = newtype(TY_PTR);
    t->base = base;
    t->size = 8;
    return t;
}

static Type *array_of(Type *base, int len) {
    Type *t = newtype(TY_ARRAY);
    t->base = base;
    t->array_len = len;
    t->size = base->size * len;
    return t;
}

static Type *struct_type(StructDef *sd) {
    Type *t = newtype(TY_STRUCT);
    t->struct_def = sd;
    t->size = sd->size;
    return t;
}

static StructDef *find_struct(char *name) {
    for (StructDef *s = struct_defs; s; s = s->next)
        if (!strcmp(s->name, name)) return s;
    return 0;
}

static Member *find_member(StructDef *sd, char *name) {
    for (Member *m = sd->members; m; m = m->next)
        if (!strcmp(m->name, name)) return m;
    return 0;
}

static int is_pointer(Type *t) { return t && t->kind == TY_PTR; }
static int is_array(Type *t) { return t && t->kind == TY_ARRAY; }
static int is_struct(Type *t) { return t && t->kind == TY_STRUCT; }

static Type *decay(Type *t) {
    if (is_array(t)) return ptr_to(t->base);
    return t;
}

/* ---------- AST / symbols ---------- */

enum {
    ND_NUM, ND_VAR, ND_ADD, ND_SUB, ND_MUL, ND_DIV, ND_MOD,
    ND_EQ, ND_NE, ND_LT, ND_LE, ND_GT, ND_GE,
    ND_ASSIGN, ND_ADDR, ND_DEREF, ND_NOT, ND_NEG,
    ND_FUNCALL, ND_RETURN, ND_IF, ND_WHILE, ND_BLOCK, ND_EXPR_STMT,
    ND_LOGAND, ND_LOGOR, ND_MEMBER
};

typedef struct Node Node;
typedef struct Obj Obj;
typedef struct Function Function;

struct Node {
    int kind;
    Node *next;
    Node *lhs, *rhs;
    Node *cond, *then, *els, *body;
    long val;
    Obj *var;
    char *funcname;
    Node *args;
    int str_label;
    Type *ty;
    Member *member;
    int is_arrow;
};

struct Obj {
    char *name;
    int is_local;
    int is_func;
    int offset;
    Type *ty;
    Obj *next;
};

struct Function {
    char *name;
    Obj *params[6];
    int nparams;
    Obj *locals;
    Node *body;
    int stack_size;
    Function *next;
};

static Obj *globals;
static Function *functions;
static Obj *locals;
static char *current_fn_name;
static int str_count;
typedef struct StrLit { char *data; int len; int label; struct StrLit *next; } StrLit;
static StrLit *str_lits;

static Obj *find_obj(Obj *list, char *name) {
    for (Obj *o = list; o; o = o->next)
        if (!strcmp(o->name, name)) return o;
    return 0;
}

static Obj *find_var(char *name) {
    Obj *o = find_obj(locals, name);
    if (o) return o;
    return find_obj(globals, name);
}

static Obj *new_obj(char *name, int is_local) {
    Obj *o = calloc(1, sizeof(Obj));
    o->name = name;
    o->is_local = is_local;
    if (is_local) {
        o->next = locals;
        locals = o;
    } else {
        o->next = globals;
        globals = o;
    }
    return o;
}

static Node *new_node(int kind) {
    Node *n = calloc(1, sizeof(Node));
    n->kind = kind;
    return n;
}

static Node *new_binary(int kind, Node *lhs, Node *rhs) {
    Node *n = new_node(kind);
    n->lhs = lhs;
    n->rhs = rhs;
    return n;
}

static Node *new_unary(int kind, Node *lhs) {
    Node *n = new_node(kind);
    n->lhs = lhs;
    return n;
}

static Node *new_num(long v) {
    Node *n = new_node(ND_NUM);
    n->val = v;
    n->ty = ty_int;
    return n;
}

static void add_type(Node *n);

/* ---------- parser ---------- */

static Node *expr(Token **rest, Token *tok);
static Node *stmt(Token **rest, Token *tok);
static Node *compound_stmt(Token **rest, Token *tok);
static Type *decl_spec(Token **rest, Token *tok);
static Obj *parse_decl(Token **rest, Token *tok, int is_local);

static Type *decl_spec(Token **rest, Token *tok) {
    if (equal(tok, TK_INT)) {
        *rest = tok->next;
        return ty_int;
    }
    if (equal(tok, TK_STRUCT)) {
        tok = tok->next;
        if (!equal(tok, TK_IDENT)) error("expected struct tag");
        char *name = tokstr(tok);
        tok = tok->next;
        StructDef *sd = find_struct(name);
        if (!sd) {
            /* incomplete struct type — filled in by a later definition */
            sd = calloc(1, sizeof(StructDef));
            sd->name = name;
            sd->next = struct_defs;
            struct_defs = sd;
        }
        *rest = tok;
        return struct_type(sd);
    }
    error("expected type");
    return 0;
}

static Node *primary(Token **rest, Token *tok) {
    if (equal(tok, TK_SIZEOF)) {
        tok = tok->next;
        tok = skip(tok, TK_LPAREN);
        if (equal(tok, TK_STRUCT) || equal(tok, TK_INT)) {
            Type *ty = decl_spec(&tok, tok);
            while (equal(tok, TK_STAR)) {
                ty = ptr_to(ty);
                tok = tok->next;
            }
            tok = skip(tok, TK_RPAREN);
            *rest = tok;
            return new_num(ty->size);
        }
        Node *n = expr(&tok, tok);
        tok = skip(tok, TK_RPAREN);
        add_type(n);
        *rest = tok;
        return new_num(n->ty->size);
    }
    if (equal(tok, TK_LPAREN)) {
        Node *n = expr(&tok, tok->next);
        *rest = skip(tok, TK_RPAREN);
        return n;
    }
    if (equal(tok, TK_NUM)) {
        Node *n = new_num(tok->val);
        *rest = tok->next;
        return n;
    }
    if (equal(tok, TK_STR)) {
        int len;
        char *data = unescape(tok->str, tok->len, &len);
        StrLit *s = calloc(1, sizeof(StrLit));
        s->data = data;
        s->len = len;
        s->label = str_count++;
        s->next = str_lits;
        str_lits = s;
        Node *n = new_node(ND_NUM);
        n->str_label = s->label + 1;
        n->ty = ptr_to(ty_int); /* treat as pointer */
        *rest = tok->next;
        return n;
    }
    if (equal(tok, TK_IDENT)) {
        char *name = tokstr(tok);
        Token *t = tok->next;
        if (equal(t, TK_LPAREN)) {
            Node *n = new_node(ND_FUNCALL);
            n->funcname = name;
            n->ty = ty_int;
            t = t->next;
            Node head = {0};
            Node *cur = &head;
            while (!equal(t, TK_RPAREN)) {
                if (cur != &head) t = skip(t, TK_COMMA);
                cur = cur->next = expr(&t, t);
            }
            n->args = head.next;
            *rest = t->next;
            return n;
        }
        Obj *var = find_var(name);
        if (!var) error("undefined variable: %s", name);
        Node *n = new_node(ND_VAR);
        n->var = var;
        n->ty = var->ty;
        *rest = t;
        return n;
    }
    error("expected expression");
    return 0;
}

static Node *postfix(Token **rest, Token *tok) {
    Node *n = primary(&tok, tok);
    for (;;) {
        if (equal(tok, TK_LBRACK)) {
            Node *idx = expr(&tok, tok->next);
            tok = skip(tok, TK_RBRACK);
            add_type(n);
            Type *t = decay(n->ty);
            if (!is_pointer(t)) error("subscript of non-pointer");
            int elem = t->base->size;
            Node *scaled = new_binary(ND_MUL, idx, new_num(elem));
            n = new_unary(ND_DEREF, new_binary(ND_ADD, n, scaled));
            n->ty = t->base;
            continue;
        }
        if (equal(tok, TK_DOT) || equal(tok, TK_ARROW)) {
            int is_arrow = equal(tok, TK_ARROW);
            tok = tok->next;
            if (!equal(tok, TK_IDENT)) error("expected member name");
            char *name = tokstr(tok);
            tok = tok->next;
            add_type(n);
            Type *sty;
            if (is_arrow) {
                Type *t = decay(n->ty);
                if (!is_pointer(t) || !is_struct(t->base))
                    error("arrow on non-struct-pointer");
                sty = t->base;
            } else {
                Type *t = n->ty;
                if (is_array(t)) error("dot on array");
                if (!is_struct(t)) error("dot on non-struct");
                sty = t;
            }
            Member *m = find_member(sty->struct_def, name);
            if (!m) error("unknown member: %s", name);
            Node *mem = new_node(ND_MEMBER);
            mem->lhs = n;
            mem->member = m;
            mem->is_arrow = is_arrow;
            mem->ty = m->ty ? m->ty : ty_int;
            n = mem;
            continue;
        }
        *rest = tok;
        return n;
    }
}

static Node *unary(Token **rest, Token *tok) {
    if (equal(tok, TK_PLUS)) return unary(rest, tok->next);
    if (equal(tok, TK_MINUS)) {
        Node *n = new_unary(ND_NEG, unary(rest, tok->next));
        n->ty = ty_int;
        return n;
    }
    if (equal(tok, TK_STAR)) {
        Node *n = new_unary(ND_DEREF, unary(rest, tok->next));
        return n;
    }
    if (equal(tok, TK_AMP)) {
        Node *n = new_unary(ND_ADDR, unary(rest, tok->next));
        return n;
    }
    if (equal(tok, TK_NOT)) {
        Node *n = new_unary(ND_NOT, unary(rest, tok->next));
        n->ty = ty_int;
        return n;
    }
    return postfix(rest, tok);
}

static void add_type(Node *n) {
    if (!n || n->ty) return;
    add_type(n->lhs);
    add_type(n->rhs);
    add_type(n->cond);
    add_type(n->then);
    add_type(n->els);
    add_type(n->body);
    for (Node *a = n->args; a; a = a->next) add_type(a);
    for (Node *s = n->body; n->kind == ND_BLOCK && s; s = s->next) add_type(s);

    switch (n->kind) {
    case ND_NUM:
        n->ty = ty_int;
        return;
    case ND_VAR:
        n->ty = n->var->ty;
        return;
    case ND_ADD:
    case ND_SUB:
    case ND_MUL:
    case ND_DIV:
    case ND_MOD:
    case ND_EQ:
    case ND_NE:
    case ND_LT:
    case ND_LE:
    case ND_GT:
    case ND_GE:
    case ND_LOGAND:
    case ND_LOGOR:
    case ND_NOT:
    case ND_NEG:
    case ND_ASSIGN:
        n->ty = ty_int;
        return;
    case ND_ADDR:
        add_type(n->lhs);
        if (is_array(n->lhs->ty))
            n->ty = ptr_to(n->lhs->ty->base);
        else
            n->ty = ptr_to(n->lhs->ty);
        return;
    case ND_DEREF:
        add_type(n->lhs);
        {
            Type *t = decay(n->lhs->ty);
            if (is_pointer(t))
                n->ty = t->base;
            else if (t && t->kind == TY_INT)
                n->ty = ty_int; /* allow int as opaque pointer */
            else
                error("dereferencing non-pointer");
        }
        return;
    case ND_MEMBER:
        n->ty = n->member->ty ? n->member->ty : ty_int;
        return;
    case ND_FUNCALL:
        n->ty = ty_int;
        return;
    default:
        return;
    }
}

static Node *mul(Token **rest, Token *tok) {
    Node *n = unary(&tok, tok);
    for (;;) {
        if (equal(tok, TK_STAR)) { n = new_binary(ND_MUL, n, unary(&tok, tok->next)); continue; }
        if (equal(tok, TK_SLASH)) { n = new_binary(ND_DIV, n, unary(&tok, tok->next)); continue; }
        if (equal(tok, TK_PERCENT)) { n = new_binary(ND_MOD, n, unary(&tok, tok->next)); continue; }
        *rest = tok;
        return n;
    }
}

static Node *add(Token **rest, Token *tok) {
    Node *n = mul(&tok, tok);
    for (;;) {
        if (equal(tok, TK_PLUS)) { n = new_binary(ND_ADD, n, mul(&tok, tok->next)); continue; }
        if (equal(tok, TK_MINUS)) { n = new_binary(ND_SUB, n, mul(&tok, tok->next)); continue; }
        *rest = tok;
        return n;
    }
}

static Node *relational(Token **rest, Token *tok) {
    Node *n = add(&tok, tok);
    for (;;) {
        if (equal(tok, TK_LT)) { n = new_binary(ND_LT, n, add(&tok, tok->next)); continue; }
        if (equal(tok, TK_GT)) { n = new_binary(ND_GT, n, add(&tok, tok->next)); continue; }
        if (equal(tok, TK_LE)) { n = new_binary(ND_LE, n, add(&tok, tok->next)); continue; }
        if (equal(tok, TK_GE)) { n = new_binary(ND_GE, n, add(&tok, tok->next)); continue; }
        *rest = tok;
        return n;
    }
}

static Node *equality(Token **rest, Token *tok) {
    Node *n = relational(&tok, tok);
    for (;;) {
        if (equal(tok, TK_EQ)) { n = new_binary(ND_EQ, n, relational(&tok, tok->next)); continue; }
        if (equal(tok, TK_NE)) { n = new_binary(ND_NE, n, relational(&tok, tok->next)); continue; }
        *rest = tok;
        return n;
    }
}

static Node *logand(Token **rest, Token *tok) {
    Node *n = equality(&tok, tok);
    while (equal(tok, TK_AND))
        n = new_binary(ND_LOGAND, n, equality(&tok, tok->next));
    *rest = tok;
    return n;
}

static Node *logor(Token **rest, Token *tok) {
    Node *n = logand(&tok, tok);
    while (equal(tok, TK_OR))
        n = new_binary(ND_LOGOR, n, logand(&tok, tok->next));
    *rest = tok;
    return n;
}

static Node *assign(Token **rest, Token *tok) {
    Node *n = logor(&tok, tok);
    if (equal(tok, TK_ASSIGN))
        return new_binary(ND_ASSIGN, n, assign(rest, tok->next));
    *rest = tok;
    return n;
}

static Node *expr(Token **rest, Token *tok) {
    return assign(rest, tok);
}

static Obj *parse_decl(Token **rest, Token *tok, int is_local) {
    Type *ty = decl_spec(&tok, tok);
    while (equal(tok, TK_STAR)) {
        ty = ptr_to(ty);
        tok = tok->next;
    }
    if (!equal(tok, TK_IDENT)) error("expected identifier in declaration");
    char *name = tokstr(tok);
    tok = tok->next;
    if (equal(tok, TK_LBRACK)) {
        tok = tok->next;
        if (!equal(tok, TK_NUM)) error("expected array size");
        ty = array_of(ty, tok->val);
        tok = skip(tok->next, TK_RBRACK);
    }
    Obj *o = new_obj(name, is_local);
    o->ty = ty;
    *rest = tok;
    return o;
}

static Node *stmt(Token **rest, Token *tok) {
    if (equal(tok, TK_RETURN)) {
        Node *n = new_node(ND_RETURN);
        if (!equal(tok->next, TK_SEMI))
            n->lhs = expr(&tok, tok->next);
        else
            tok = tok->next;
        *rest = skip(tok, TK_SEMI);
        return n;
    }
    if (equal(tok, TK_IF)) {
        Node *n = new_node(ND_IF);
        tok = skip(tok->next, TK_LPAREN);
        n->cond = expr(&tok, tok);
        tok = skip(tok, TK_RPAREN);
        n->then = stmt(&tok, tok);
        if (equal(tok, TK_ELSE))
            n->els = stmt(&tok, tok->next);
        *rest = tok;
        return n;
    }
    if (equal(tok, TK_WHILE)) {
        Node *n = new_node(ND_WHILE);
        tok = skip(tok->next, TK_LPAREN);
        n->cond = expr(&tok, tok);
        tok = skip(tok, TK_RPAREN);
        n->body = stmt(&tok, tok);
        *rest = tok;
        return n;
    }
    if (equal(tok, TK_LBRACE))
        return compound_stmt(rest, tok);
    if (equal(tok, TK_INT) || equal(tok, TK_STRUCT)) {
        parse_decl(&tok, tok, 1);
        *rest = skip(tok, TK_SEMI);
        return new_node(ND_BLOCK);
    }
    Node *n = new_node(ND_EXPR_STMT);
    n->lhs = expr(&tok, tok);
    *rest = skip(tok, TK_SEMI);
    return n;
}

static Node *compound_stmt(Token **rest, Token *tok) {
    Node *n = new_node(ND_BLOCK);
    tok = skip(tok, TK_LBRACE);
    Node head = {0};
    Node *cur = &head;
    while (!equal(tok, TK_RBRACE) && !equal(tok, TK_EOF)) {
        cur = cur->next = stmt(&tok, tok);
    }
    n->body = head.next;
    *rest = skip(tok, TK_RBRACE);
    return n;
}

static Function *parse_function(Token **rest, Token *tok, char *name, Type *ret_unused) {
    (void)ret_unused;
    locals = 0;
    Function *fn = calloc(1, sizeof(Function));
    fn->name = name;
    tok = skip(tok, TK_LPAREN);
    while (!equal(tok, TK_RPAREN)) {
        if (fn->nparams) tok = skip(tok, TK_COMMA);
        if (fn->nparams >= 6) error("too many parameters");
        fn->params[fn->nparams++] = parse_decl(&tok, tok, 1);
    }
    tok = tok->next;
    fn->body = compound_stmt(&tok, tok);
    fn->locals = locals;
    *rest = tok;
    return fn;
}

static void parse_struct_def(Token **rest, Token *tok) {
    /* tok at TK_STRUCT */
    tok = tok->next;
    if (!equal(tok, TK_IDENT)) error("expected struct tag");
    char *name = tokstr(tok);
    tok = tok->next;
    StructDef *sd = find_struct(name);
    if (sd && sd->members) error("redefinition of struct %s", name);
    if (!sd) {
        sd = calloc(1, sizeof(StructDef));
        sd->name = name;
        sd->next = struct_defs;
        struct_defs = sd;
    }
    tok = skip(tok, TK_LBRACE);
    Member head = {0};
    Member *cur = &head;
    int offset = 0;
    while (!equal(tok, TK_RBRACE)) {
        Type *mty = decl_spec(&tok, tok);
        while (equal(tok, TK_STAR)) {
            mty = ptr_to(mty);
            tok = tok->next;
        }
        if (!equal(tok, TK_IDENT)) error("expected member name");
        Member *m = calloc(1, sizeof(Member));
        m->name = tokstr(tok);
        m->offset = offset;
        m->ty = mty;
        offset += 8; /* all current field types are word-sized */
        cur = cur->next = m;
        tok = skip(tok->next, TK_SEMI);
    }
    sd->members = head.next;
    sd->size = offset;
    tok = skip(tok, TK_RBRACE);
    *rest = skip(tok, TK_SEMI);
}

static void parse_program(Token *tok) {
    Function *fn_head = 0;
    Function **fn_tail = &fn_head;
    while (!equal(tok, TK_EOF)) {
        if (equal(tok, TK_STRUCT) && equal(tok->next, TK_IDENT) && equal(tok->next->next, TK_LBRACE)) {
            parse_struct_def(&tok, tok);
            continue;
        }
        Type *basety = decl_spec(&tok, tok);
        Type *ty = basety;
        while (equal(tok, TK_STAR)) {
            ty = ptr_to(ty);
            tok = tok->next;
        }
        if (!equal(tok, TK_IDENT)) error("expected identifier");
        char *name = tokstr(tok);
        tok = tok->next;
        if (equal(tok, TK_LPAREN)) {
            Function *fn = parse_function(&tok, tok, name, ty);
            *fn_tail = fn;
            fn_tail = &fn->next;
            Obj *o = new_obj(name, 0);
            o->is_func = 1;
            o->ty = ty;
        } else {
            if (equal(tok, TK_LBRACK)) {
                tok = tok->next;
                if (!equal(tok, TK_NUM)) error("expected array size");
                ty = array_of(ty, tok->val);
                tok = skip(tok->next, TK_RBRACK);
            }
            Obj *o = new_obj(name, 0);
            o->ty = ty;
            tok = skip(tok, TK_SEMI);
        }
    }
    functions = fn_head;
}

/* ---------- codegen ---------- */

static int label_id;
static int new_label(void) { return label_id++; }

static void gen_addr(Node *n);
static void gen_expr(Node *n);
static void gen_stmt(Node *n);

static char *argreg[] = {"%rdi", "%rsi", "%rdx", "%rcx", "%r8", "%r9"};

static void gen_addr(Node *n) {
    add_type(n);
    if (n->kind == ND_VAR) {
        if (n->var->is_local)
            printf("  lea %d(%%rbp), %%rax\n", n->var->offset);
        else
            printf("  lea %s(%%rip), %%rax\n", n->var->name);
        return;
    }
    if (n->kind == ND_DEREF) {
        gen_expr(n->lhs);
        return;
    }
    if (n->kind == ND_MEMBER) {
        if (n->is_arrow) {
            gen_expr(n->lhs);
        } else {
            gen_addr(n->lhs);
        }
        if (n->member->offset)
            printf("  add $%d, %%rax\n", n->member->offset);
        return;
    }
    error("not an lvalue");
}

static void gen_expr(Node *n) {
    add_type(n);
    switch (n->kind) {
    case ND_NUM:
        if (n->str_label)
            printf("  lea .L.str%d(%%rip), %%rax\n", n->str_label - 1);
        else
            printf("  mov $%ld, %%rax\n", n->val);
        return;
    case ND_VAR:
        gen_addr(n);
        if (is_array(n->ty) || is_struct(n->ty))
            return; /* decay to pointer / address of struct */
        printf("  mov (%%rax), %%rax\n");
        return;
    case ND_MEMBER:
        gen_addr(n);
        printf("  mov (%%rax), %%rax\n");
        return;
    case ND_ADDR:
        gen_addr(n->lhs);
        return;
    case ND_DEREF:
        gen_expr(n->lhs);
        printf("  mov (%%rax), %%rax\n");
        return;
    case ND_ASSIGN:
        gen_addr(n->lhs);
        printf("  push %%rax\n");
        gen_expr(n->rhs);
        printf("  pop %%rdi\n");
        printf("  mov %%rax, (%%rdi)\n");
        return;
    case ND_NOT:
        gen_expr(n->lhs);
        printf("  cmp $0, %%rax\n");
        printf("  sete %%al\n");
        printf("  movzb %%al, %%rax\n");
        return;
    case ND_NEG:
        gen_expr(n->lhs);
        printf("  neg %%rax\n");
        return;
    case ND_LOGAND: {
        int l = new_label();
        gen_expr(n->lhs);
        printf("  cmp $0, %%rax\n");
        printf("  je .L.false%d\n", l);
        gen_expr(n->rhs);
        printf("  cmp $0, %%rax\n");
        printf("  je .L.false%d\n", l);
        printf("  mov $1, %%rax\n");
        printf("  jmp .L.end%d\n", l);
        printf(".L.false%d:\n", l);
        printf("  mov $0, %%rax\n");
        printf(".L.end%d:\n", l);
        return;
    }
    case ND_LOGOR: {
        int l = new_label();
        gen_expr(n->lhs);
        printf("  cmp $0, %%rax\n");
        printf("  jne .L.true%d\n", l);
        gen_expr(n->rhs);
        printf("  cmp $0, %%rax\n");
        printf("  je .L.false%d\n", l);
        printf(".L.true%d:\n", l);
        printf("  mov $1, %%rax\n");
        printf("  jmp .L.end%d\n", l);
        printf(".L.false%d:\n", l);
        printf("  mov $0, %%rax\n");
        printf(".L.end%d:\n", l);
        return;
    }
    case ND_FUNCALL: {
        int nargs = 0;
        for (Node *a = n->args; a; a = a->next) nargs++;
        if (nargs > 6) error("too many arguments (max 6)");
        for (Node *a = n->args; a; a = a->next) {
            gen_expr(a);
            printf("  push %%rax\n");
        }
        for (int i = nargs - 1; i >= 0; i--)
            printf("  pop %s\n", argreg[i]);
        printf("  sub $8, %%rsp\n");
        printf("  call %s\n", n->funcname);
        printf("  add $8, %%rsp\n");
        return;
    }
    default:
        break;
    }

    gen_expr(n->lhs);
    printf("  push %%rax\n");
    gen_expr(n->rhs);
    printf("  mov %%rax, %%rdi\n");
    printf("  pop %%rax\n");

    switch (n->kind) {
    case ND_ADD: printf("  add %%rdi, %%rax\n"); break;
    case ND_SUB: printf("  sub %%rdi, %%rax\n"); break;
    case ND_MUL: printf("  imul %%rdi, %%rax\n"); break;
    case ND_DIV:
        printf("  cqo\n");
        printf("  idiv %%rdi\n");
        break;
    case ND_MOD:
        printf("  cqo\n");
        printf("  idiv %%rdi\n");
        printf("  mov %%rdx, %%rax\n");
        break;
    case ND_EQ:
        printf("  cmp %%rdi, %%rax\n");
        printf("  sete %%al\n");
        printf("  movzb %%al, %%rax\n");
        break;
    case ND_NE:
        printf("  cmp %%rdi, %%rax\n");
        printf("  setne %%al\n");
        printf("  movzb %%al, %%rax\n");
        break;
    case ND_LT:
        printf("  cmp %%rdi, %%rax\n");
        printf("  setl %%al\n");
        printf("  movzb %%al, %%rax\n");
        break;
    case ND_LE:
        printf("  cmp %%rdi, %%rax\n");
        printf("  setle %%al\n");
        printf("  movzb %%al, %%rax\n");
        break;
    case ND_GT:
        printf("  cmp %%rdi, %%rax\n");
        printf("  setg %%al\n");
        printf("  movzb %%al, %%rax\n");
        break;
    case ND_GE:
        printf("  cmp %%rdi, %%rax\n");
        printf("  setge %%al\n");
        printf("  movzb %%al, %%rax\n");
        break;
    default:
        error("invalid expression kind %d", n->kind);
    }
}

static void gen_stmt(Node *n) {
    switch (n->kind) {
    case ND_RETURN:
        if (n->lhs) gen_expr(n->lhs);
        else printf("  mov $0, %%rax\n");
        printf("  jmp .L.return.%s\n", current_fn_name);
        return;
    case ND_EXPR_STMT:
        gen_expr(n->lhs);
        return;
    case ND_BLOCK:
        for (Node *s = n->body; s; s = s->next)
            gen_stmt(s);
        return;
    case ND_IF: {
        int l = new_label();
        gen_expr(n->cond);
        printf("  cmp $0, %%rax\n");
        printf("  je .L.else%d\n", l);
        gen_stmt(n->then);
        printf("  jmp .L.end%d\n", l);
        printf(".L.else%d:\n", l);
        if (n->els) gen_stmt(n->els);
        printf(".L.end%d:\n", l);
        return;
    }
    case ND_WHILE: {
        int l = new_label();
        printf(".L.begin%d:\n", l);
        gen_expr(n->cond);
        printf("  cmp $0, %%rax\n");
        printf("  je .L.end%d\n", l);
        gen_stmt(n->body);
        printf("  jmp .L.begin%d\n", l);
        printf(".L.end%d:\n", l);
        return;
    }
    default:
        error("invalid statement");
    }
}

static void assign_lvar_offsets(Function *fn) {
    int off = 0;
    for (Obj *v = fn->locals; v; v = v->next) {
        int sz = v->ty->size;
        if (sz <= 0) sz = 8;
        off += sz;
        v->offset = -off;
    }
    fn->stack_size = (off + 15) & ~15;
}

static void emit_data(void) {
    printf(".section .bss\n");
    printf(".align 8\n");
    for (Obj *g = globals; g; g = g->next) {
        if (g->is_func) continue;
        int sz = g->ty ? g->ty->size : 8;
        if (sz <= 0) sz = 8;
        printf("%s: .skip %d\n", g->name, sz);
    }
    printf(".section .rodata\n");
    for (int i = 0; i < str_count; i++) {
        StrLit *s = str_lits;
        while (s && s->label != i) s = s->next;
        if (!s) continue;
        printf(".L.str%d:\n", s->label);
        printf("  .byte ");
        for (int j = 0; j < s->len; j++) {
            if (j) printf(",");
            printf("%d", (unsigned char)s->data[j]);
        }
        if (s->len == 0) printf("0");
        else printf(",0");
        printf("\n");
    }
}

static void emit_text(void) {
    printf(".section .text\n");
    for (Function *fn = functions; fn; fn = fn->next) {
        assign_lvar_offsets(fn);
        current_fn_name = fn->name;
        printf(".globl %s\n", fn->name);
        printf("%s:\n", fn->name);
        printf("  push %%rbp\n");
        printf("  mov %%rsp, %%rbp\n");
        printf("  sub $%d, %%rsp\n", fn->stack_size);

        for (int i = 0; i < fn->nparams; i++)
            printf("  mov %s, %d(%%rbp)\n", argreg[i], fn->params[i]->offset);

        gen_stmt(fn->body);

        printf(".L.return.%s:\n", fn->name);
        printf("  mov %%rbp, %%rsp\n");
        printf("  pop %%rbp\n");
        printf("  ret\n");
    }
}

static void codegen(void) {
    emit_data();
    emit_text();
}

int main(int argc, char **argv) {
    if (argc != 2) error("usage: l8c0 <file.l8>");
    ty_int = newtype(TY_INT);
    ty_int->size = 8;
    source = read_file(argv[1]);
    token = tokenize(source);
    parse_program(token);
    codegen();
    return 0;
}
