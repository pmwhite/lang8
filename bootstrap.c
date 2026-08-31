/*
 * L8 bootstrap compiler (C)
 *
 * Language: C-like subset → x86-64 Linux GAS assembly
 *
 *   Types:     int, i8 (byte), named structs, pointers as `*T`, arrays as `T[N]`
 *   Decls:     name-first: `x: int = expr;`, `p: *Point = uninitialized;`
 *              locals require `= expr` or `= uninitialized`
 *   Functions: `name(a: int, b: int): int { ... }` or `name(a: int) { ... }` (no return)
 *   Control:   if/else, while, return, blocks
 *   Ops:       + - * / %  == != < <= > >=  && ||  =  & ! -  []  .  .*  ()
 *              `e as T` widen/reinterpret; `e trunc T` narrow (e.g. int→i8)
 *   Other:     sizeof(T), string/char literals, // comments
 *              `p.*` dereferences (Zig-style); `*` is multiply / pointer types only
 *              member access: one operator `.` (auto-derefs pointers)
 *              string literals have type *i8 (length-prefixed: len at -8, data at ptr)
 *              no implicit casts; char literals have type i8
 *   Runtime:   read/write/open/close/exit/malloc/syscall/len
 *              byte memory via i8 / *i8 and [] / .*
 *              len(p) reads the length word at p-8 (for length-prefixed *i8)
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
    TK_EOF, TK_NUM, TK_CHAR, TK_STR, TK_IDENT,
    TK_INT, TK_I8, TK_IF, TK_ELSE, TK_WHILE, TK_RETURN,
    TK_STRUCT, TK_SIZEOF, TK_UNINITIALIZED, TK_AS, TK_TRUNC,
    TK_EQ, TK_NE, TK_LE, TK_GE,
    TK_PLUS, TK_MINUS, TK_STAR, TK_SLASH, TK_PERCENT,
    TK_LT, TK_GT, TK_ASSIGN, TK_NOT, TK_AMP,
    TK_LPAREN, TK_RPAREN, TK_LBRACE, TK_RBRACE,
    TK_LBRACK, TK_RBRACK, TK_SEMI, TK_COMMA, TK_COLON,
    TK_AND, TK_OR, TK_DOT
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
                else if (*p == 'r') v = '\r';
                else if (*p == '0') v = 0;
                else if (*p == '\\') v = '\\';
                else if (*p == '\'') v = '\'';
                else if (*p == '"') v = '"';
                else v = *p;
                p++;
            } else {
                v = *p++;
            }
            if (*p == '\'') p++;
            cur = cur->next = new_token(TK_CHAR, p, 0);
            cur->val = v;
            continue;
        }
        if (is_ident1(*p)) {
            char *s = p;
            while (is_ident2(*p)) p++;
            int n = p - s;
            int kind = TK_IDENT;
            if (kw_eq(s, n, "int")) kind = TK_INT;
            else if (kw_eq(s, n, "i8")) kind = TK_I8;
            else if (kw_eq(s, n, "if")) kind = TK_IF;
            else if (kw_eq(s, n, "else")) kind = TK_ELSE;
            else if (kw_eq(s, n, "while")) kind = TK_WHILE;
            else if (kw_eq(s, n, "return")) kind = TK_RETURN;
            else if (kw_eq(s, n, "struct")) kind = TK_STRUCT;
            else if (kw_eq(s, n, "sizeof")) kind = TK_SIZEOF;
            else if (kw_eq(s, n, "uninitialized")) kind = TK_UNINITIALIZED;
            else if (kw_eq(s, n, "as")) kind = TK_AS;
            else if (kw_eq(s, n, "trunc")) kind = TK_TRUNC;
            cur = cur->next = new_token(kind, s, n);
            continue;
        }
        if (p[0] == '=' && p[1] == '=') { cur = cur->next = new_token(TK_EQ, p, 2); p += 2; continue; }
        if (p[0] == '!' && p[1] == '=') { cur = cur->next = new_token(TK_NE, p, 2); p += 2; continue; }
        if (p[0] == '<' && p[1] == '=') { cur = cur->next = new_token(TK_LE, p, 2); p += 2; continue; }
        if (p[0] == '>' && p[1] == '=') { cur = cur->next = new_token(TK_GE, p, 2); p += 2; continue; }
        if (p[0] == '&' && p[1] == '&') { cur = cur->next = new_token(TK_AND, p, 2); p += 2; continue; }
        if (p[0] == '|' && p[1] == '|') { cur = cur->next = new_token(TK_OR, p, 2); p += 2; continue; }

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
        case ':': kind = TK_COLON; break;
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
            else if (s[i] == 'r') buf[j++] = '\r';
            else if (s[i] == '0') buf[j++] = 0;
            else if (s[i] == '\\') buf[j++] = '\\';
            else if (s[i] == '"') buf[j++] = '"';
            else if (s[i] == '\'') buf[j++] = '\'';
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

enum { TY_INT, TY_I8, TY_PTR, TY_ARRAY, TY_STRUCT };

struct Type {
    int kind;
    Type *base;
    int array_len;
    StructDef *struct_def;
    int size;
};

static StructDef *struct_defs;
static Type *ty_int;
static Type *ty_i8;

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

static StructDef *get_or_create_struct(char *name) {
    StructDef *sd = find_struct(name);
    if (sd) return sd;
    sd = calloc(1, sizeof(StructDef));
    sd->name = name;
    sd->next = struct_defs;
    struct_defs = sd;
    return sd;
}

static int is_type_name(Token *tok) {
    if (!equal(tok, TK_IDENT)) return 0;
    char name[256];
    if (tok->len >= (int)sizeof(name)) return 0;
    memcpy(name, tok->str, tok->len);
    name[tok->len] = 0;
    return find_struct(name) != 0;
}

/* True if tok begins a type: int, i8, StructName, or *type */
static int starts_type(Token *tok) {
    if (equal(tok, TK_INT) || equal(tok, TK_I8) || is_type_name(tok)) return 1;
    Token *t = tok;
    while (equal(t, TK_STAR)) t = t->next;
    if (t != tok && (equal(t, TK_INT) || equal(t, TK_I8) || is_type_name(t))) return 1;
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
static int is_i8(Type *t) { return t && t->kind == TY_I8; }
static int is_int_ty(Type *t) { return t && t->kind == TY_INT; }
static Type *decay(Type *t);

static int types_equal(Type *a, Type *b) {
    if (a == b) return 1;
    if (!a || !b) return 0;
    if (a->kind != b->kind) return 0;
    if (a->kind == TY_PTR) return types_equal(a->base, b->base);
    if (a->kind == TY_ARRAY) return a->array_len == b->array_len && types_equal(a->base, b->base);
    if (a->kind == TY_STRUCT) return a->struct_def == b->struct_def;
    return 1; /* int, i8 */
}

static int is_word_ty(Type *t) {
    t = decay(t);
    return t && t->size == 8;
}

static void check_as(Type *from, Type *to) {
    from = decay(from);
    to = decay(to);
    if (types_equal(from, to)) return;
    if (is_i8(from) && is_int_ty(to)) return; /* widen */
    if (is_word_ty(from) && is_word_ty(to)) return; /* same-size reinterpret */
    error("invalid as conversion");
}

static void check_trunc(Type *from, Type *to) {
    from = decay(from);
    to = decay(to);
    if (is_int_ty(from) && is_i8(to)) return;
    error("invalid trunc conversion (expected int trunc i8)");
}

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
    ND_LOGAND, ND_LOGOR, ND_MEMBER, ND_AS, ND_TRUNC
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
};

/* Integer 0 may be used as a null pointer. */
static int is_null_const(Node *n) {
    return n && n->kind == ND_NUM && n->val == 0;
}

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
    Type *return_ty;
    Function *next;
};

static Obj *globals;
static Function *functions;
static Obj *locals;
static char *current_fn_name;
static Type *current_return_ty;
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
static Type *parse_type(Token **rest, Token *tok);
static Type *parse_type_suffix(Token **rest, Token *tok, Type *ty);
static Obj *parse_decl(Token **rest, Token *tok, int is_local);

/* Base type only: int, i8, or StructName */
static Type *decl_spec(Token **rest, Token *tok) {
    if (equal(tok, TK_INT)) {
        *rest = tok->next;
        return ty_int;
    }
    if (equal(tok, TK_I8)) {
        *rest = tok->next;
        return ty_i8;
    }
    if (equal(tok, TK_IDENT)) {
        char *name = tokstr(tok);
        StructDef *sd = get_or_create_struct(name);
        *rest = tok->next;
        return struct_type(sd);
    }
    error("expected type");
    return 0;
}

/* Full type with pointer prefix: *T is pointer-to-T */
static Type *parse_type(Token **rest, Token *tok) {
    if (equal(tok, TK_STAR)) {
        Type *base = parse_type(&tok, tok->next);
        *rest = tok;
        return ptr_to(base);
    }
    return decl_spec(rest, tok);
}

/* Optional array suffix: Type[N] */
static Type *parse_type_suffix(Token **rest, Token *tok, Type *ty) {
    if (equal(tok, TK_LBRACK)) {
        tok = tok->next;
        if (!equal(tok, TK_NUM)) error("expected array size");
        ty = array_of(ty, tok->val);
        tok = skip(tok->next, TK_RBRACK);
    }
    *rest = tok;
    return ty;
}

/* name: Type  (optional array on type) */
static Obj *parse_decl(Token **rest, Token *tok, int is_local) {
    if (!equal(tok, TK_IDENT)) error("expected identifier in declaration");
    char *name = tokstr(tok);
    tok = skip(tok->next, TK_COLON);
    Type *ty = parse_type(&tok, tok);
    ty = parse_type_suffix(&tok, tok, ty);
    Obj *o = new_obj(name, is_local);
    o->ty = ty;
    *rest = tok;
    return o;
}

static Node *primary(Token **rest, Token *tok) {
    if (equal(tok, TK_SIZEOF)) {
        tok = tok->next;
        tok = skip(tok, TK_LPAREN);
        if (starts_type(tok)) {
            Type *ty = parse_type(&tok, tok);
            ty = parse_type_suffix(&tok, tok, ty);
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
    if (equal(tok, TK_CHAR)) {
        Node *n = new_num(tok->val);
        n->ty = ty_i8;
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
        n->ty = ptr_to(ty_i8);
        *rest = tok->next;
        return n;
    }
    if (equal(tok, TK_IDENT)) {
        char *name = tokstr(tok);
        Token *t = tok->next;
        if (equal(t, TK_LPAREN)) {
            Node *n = new_node(ND_FUNCALL);
            n->funcname = name;
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
            add_type(idx);
            if (!is_int_ty(decay(idx->ty))) error("array index must be int");
            Type *t = decay(n->ty);
            if (!is_pointer(t)) error("subscript of non-pointer");
            int elem = t->base->size;
            Node *scaled = new_binary(ND_MUL, idx, new_num(elem));
            n = new_unary(ND_DEREF, new_binary(ND_ADD, n, scaled));
            n->ty = t->base;
            continue;
        }
        if (equal(tok, TK_DOT)) {
            /* p.* — Zig-style dereference */
            if (equal(tok->next, TK_STAR)) {
                tok = tok->next->next;
                n = new_unary(ND_DEREF, n);
                continue;
            }
            tok = tok->next;
            if (!equal(tok, TK_IDENT)) error("expected member name");
            char *name = tokstr(tok);
            tok = tok->next;
            add_type(n);
            Type *t = decay(n->ty);
            Type *sty;
            if (is_pointer(t) && is_struct(t->base))
                sty = t->base;
            else if (is_struct(n->ty))
                sty = n->ty;
            else
                error("member access on non-struct");
            Member *m = find_member(sty->struct_def, name);
            if (!m) error("unknown member: %s", name);
            Node *mem = new_node(ND_MEMBER);
            mem->lhs = n;
            mem->member = m;
            mem->ty = m->ty ? m->ty : ty_int;
            n = mem;
            continue;
        }
        if (equal(tok, TK_AS) || equal(tok, TK_TRUNC)) {
            int is_trunc = equal(tok, TK_TRUNC);
            tok = tok->next;
            Type *ty = parse_type(&tok, tok);
            ty = parse_type_suffix(&tok, tok, ty);
            add_type(n);
            if (is_trunc) check_trunc(n->ty, ty);
            else check_as(n->ty, ty);
            n = new_unary(is_trunc ? ND_TRUNC : ND_AS, n);
            n->ty = ty;
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
        return n;
    }
    if (equal(tok, TK_AMP)) {
        Node *n = new_unary(ND_ADDR, unary(rest, tok->next));
        return n;
    }
    if (equal(tok, TK_NOT)) {
        Node *n = new_unary(ND_NOT, unary(rest, tok->next));
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
        if (!n->ty) n->ty = ty_int;
        return;
    case ND_VAR:
        n->ty = n->var->ty;
        return;
    case ND_ADD:
    case ND_SUB:
        add_type(n->lhs);
        add_type(n->rhs);
        {
            Type *lt = decay(n->lhs->ty);
            Type *rt = decay(n->rhs->ty);
            if (n->kind == ND_ADD && is_pointer(lt) && is_int_ty(rt)) {
                n->ty = lt; /* ptr + int */
                return;
            }
            if (n->kind == ND_ADD && is_int_ty(lt) && is_pointer(rt)) {
                n->ty = rt;
                return;
            }
            if (n->kind == ND_SUB && is_pointer(lt) && is_int_ty(rt)) {
                n->ty = lt;
                return;
            }
            if (n->kind == ND_SUB && is_pointer(lt) && is_pointer(rt) && types_equal(lt, rt)) {
                n->ty = ty_int; /* ptr - ptr */
                return;
            }
            if (!is_int_ty(lt) || !is_int_ty(rt))
                error("arithmetic requires int operands (use as/trunc)");
            n->ty = ty_int;
        }
        return;
    case ND_MUL:
    case ND_DIV:
    case ND_MOD:
        add_type(n->lhs);
        add_type(n->rhs);
        if (!is_int_ty(decay(n->lhs->ty)) || !is_int_ty(decay(n->rhs->ty)))
            error("arithmetic requires int operands (use as/trunc)");
        n->ty = ty_int;
        return;
    case ND_EQ:
    case ND_NE:
    case ND_LT:
    case ND_LE:
    case ND_GT:
    case ND_GE:
        add_type(n->lhs);
        add_type(n->rhs);
        {
            Type *lt = decay(n->lhs->ty);
            Type *rt = decay(n->rhs->ty);
            if (!types_equal(lt, rt)) {
                if (!((is_pointer(lt) && is_null_const(n->rhs)) ||
                      (is_pointer(rt) && is_null_const(n->lhs))))
                    error("comparison type mismatch (use as/trunc)");
            }
            n->ty = ty_int;
        }
        return;
    case ND_LOGAND:
    case ND_LOGOR:
        add_type(n->lhs);
        add_type(n->rhs);
        n->ty = ty_int;
        return;
    case ND_NOT:
    case ND_NEG:
        add_type(n->lhs);
        if (!is_int_ty(decay(n->lhs->ty)))
            error("unary +/- / ! requires int");
        n->ty = ty_int;
        return;
    case ND_ASSIGN:
        add_type(n->lhs);
        add_type(n->rhs);
        {
            Type *lt = decay(n->lhs->ty);
            Type *rt = decay(n->rhs->ty);
            if (is_array(n->lhs->ty)) error("cannot assign to array");
            if (!types_equal(lt, rt)) {
                if (!(is_pointer(lt) && is_null_const(n->rhs)))
                    error("assignment type mismatch (use as/trunc)");
            }
            n->ty = n->lhs->ty;
        }
        return;
    case ND_AS:
    case ND_TRUNC:
        /* type already set when built */
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
            else
                error("dereferencing non-pointer");
        }
        return;
    case ND_MEMBER:
        n->ty = n->member->ty ? n->member->ty : ty_int;
        return;
    case ND_FUNCALL:
        {
            Obj *f = find_obj(globals, n->funcname);
            if (f && f->is_func)
                n->ty = f->ty; /* null if function does not return */
            else
                n->ty = ty_int; /* undeclared/builtin */
            Function *fn = 0;
            for (Function *g = functions; g; g = g->next)
                if (!strcmp(g->name, n->funcname)) { fn = g; break; }
            if (fn) {
                int i = 0;
                for (Node *a = n->args; a; a = a->next, i++) {
                    if (i >= fn->nparams) break;
                    Obj *p = fn->params[i];
                    if (!p || !p->ty) continue;
                    Type *at = decay(a->ty);
                    Type *pt = decay(p->ty);
                    if (!types_equal(at, pt)) {
                        if (!(is_pointer(pt) && is_null_const(a)))
                            error("argument type mismatch");
                    }
                }
            }
        }
        return;
    case ND_RETURN:
        if (n->lhs) {
            if (!current_return_ty)
                error("return with a value in a non-returning function");
            {
                Type *rt = decay(current_return_ty);
                Type *gt = decay(n->lhs->ty);
                if (!types_equal(gt, rt) && !(is_pointer(rt) && is_null_const(n->lhs)))
                    error("return type mismatch (use as/trunc)");
            }
        } else if (current_return_ty) {
            error("return missing a value");
        }
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
    /* name-first local decl: name : type = expr|uninitialized ; */
    if (equal(tok, TK_IDENT) && equal(tok->next, TK_COLON)) {
        Obj *o = parse_decl(&tok, tok, 1);
        if (equal(tok, TK_COMMA))
            error("only one variable per declaration");
        tok = skip(tok, TK_ASSIGN);
        if (equal(tok, TK_UNINITIALIZED)) {
            tok = tok->next;
            *rest = skip(tok, TK_SEMI);
            return new_node(ND_BLOCK);
        }
        Node *rhs = expr(&tok, tok);
        *rest = skip(tok, TK_SEMI);
        Node *lhs = new_node(ND_VAR);
        lhs->var = o;
        lhs->ty = o->ty;
        Node *as = new_binary(ND_ASSIGN, lhs, rhs);
        Node *es = new_node(ND_EXPR_STMT);
        es->lhs = as;
        return es;
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

static Function *parse_function(Token **rest, Token *tok, char *name) {
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
    fn->return_ty = 0;
    if (equal(tok, TK_COLON)) {
        tok = tok->next;
        fn->return_ty = parse_type(&tok, tok);
    }
    fn->body = compound_stmt(&tok, tok);
    fn->locals = locals;
    *rest = tok;
    return fn;
}

static void parse_struct_def(Token **rest, Token *tok) {
    tok = tok->next;
    if (!equal(tok, TK_IDENT)) error("expected struct tag");
    char *name = tokstr(tok);
    tok = tok->next;
    StructDef *sd = get_or_create_struct(name);
    if (sd->members) error("redefinition of struct %s", name);
    tok = skip(tok, TK_LBRACE);
    Member head = {0};
    Member *cur = &head;
    int offset = 0;
    while (!equal(tok, TK_RBRACE)) {
        if (!equal(tok, TK_IDENT)) error("expected member name");
        Member *m = calloc(1, sizeof(Member));
        m->name = tokstr(tok);
        tok = skip(tok->next, TK_COLON);
        Type *mty = parse_type(&tok, tok);
        mty = parse_type_suffix(&tok, tok, mty);
        m->offset = offset;
        m->ty = mty;
        offset += 8;
        cur = cur->next = m;
        tok = skip(tok, TK_SEMI);
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
        /* name-first: name ( ... ) : type { }   or   name : type ; */
        if (!equal(tok, TK_IDENT)) error("expected identifier");
        char *name = tokstr(tok);
        tok = tok->next;
        if (equal(tok, TK_LPAREN)) {
            Function *fn = parse_function(&tok, tok, name);
            *fn_tail = fn;
            fn_tail = &fn->next;
            Obj *o = new_obj(name, 0);
            o->is_func = 1;
            o->ty = fn->return_ty;
        } else {
            tok = skip(tok, TK_COLON);
            Type *ty = parse_type(&tok, tok);
            ty = parse_type_suffix(&tok, tok, ty);
            if (equal(tok, TK_COMMA))
                error("only one variable per declaration");
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

static int is_byte_ty(Type *t) { return t && t->size == 1; }

static void load_mem(Type *ty) {
    if (is_byte_ty(ty))
        printf("  movzb (%%rax), %%rax\n");
    else
        printf("  mov (%%rax), %%rax\n");
}

static void store_mem(Type *ty) {
    if (is_byte_ty(ty))
        printf("  mov %%al, (%%rdi)\n");
    else
        printf("  mov %%rax, (%%rdi)\n");
}

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
        add_type(n->lhs);
        Type *t = decay(n->lhs->ty);
        if (is_pointer(t) && is_struct(t->base))
            gen_expr(n->lhs);
        else
            gen_addr(n->lhs);
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
            /* pointer to data; length word lives at -8 */
            printf("  lea .L.str%d+8(%%rip), %%rax\n", n->str_label - 1);
        else
            printf("  mov $%ld, %%rax\n", n->val);
        return;
    case ND_VAR:
        gen_addr(n);
        if (is_array(n->ty) || is_struct(n->ty))
            return;
        load_mem(n->ty);
        return;
    case ND_MEMBER:
        gen_addr(n);
        load_mem(n->ty);
        return;
    case ND_ADDR:
        gen_addr(n->lhs);
        return;
    case ND_AS:
    case ND_TRUNC:
        gen_expr(n->lhs);
        return;
    case ND_DEREF:
        gen_expr(n->lhs);
        load_mem(n->ty);
        return;
    case ND_ASSIGN:
        add_type(n->lhs);
        gen_addr(n->lhs);
        printf("  push %%rax\n");
        gen_expr(n->rhs);
        printf("  pop %%rdi\n");
        store_mem(n->lhs->ty);
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
    add_type(n);
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
        if (!is_array(v->ty) && sz < 8) sz = 8;
        else sz = (sz + 7) & ~7;
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
    printf(".align 8\n");
    for (int i = 0; i < str_count; i++) {
        StrLit *s = str_lits;
        while (s && s->label != i) s = s->next;
        if (!s) continue;
        printf(".L.str%d:\n", s->label);
        printf("  .quad %d\n", s->len);
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
        current_return_ty = fn->return_ty;
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
    ty_i8 = newtype(TY_I8);
    ty_i8->size = 1;
    source = read_file(argv[1]);
    token = tokenize(source);
    parse_program(token);
    codegen();
    return 0;
}
