# Tags and source organization

All top-level declaration names are globally unique within a compiled program.
Tags select which of those names are available in a file or declaration. A tag
does not contribute to symbol identity, introduce an alias, or load source files.
Functions, extern functions, types, exceptions, and global variables can all be
tagged. Locals, parameters, fields, and enum variants keep their existing scopes.

## File and declaration tags

```l8
tag parser_internal;

tag parser, parser_tools
parse(source: str): int {
    parse_impl(source);
}

parse_impl(source: str): int {
    len(source);
}
```

`tag parser_internal;` applies to every top-level definition in this file. It also
allows every declaration in the file to reference names with that tag.

Without the semicolon, `tag parser, parser_tools` modifies just the following
definition. Its tags are added to the file tags, so `parse` belongs to all three
tags. Those additional tags are also usable throughout its signature, initializer,
or body. They do not become usable in neighboring declarations.

Several file statements and several declaration modifiers can be combined.
Repeated membership across them is harmless; duplicate names within one tag list
are an error. A declaration modifier must precede a definition, not an import,
`need`, or another file directive. Tag names are ordinary identifiers, with no
separate tag declaration required.

## Bringing names into scope

```l8
tag application;
import "parser.l8";

use_tag parser;

main(): int {
    parse("hello");
    0;
}
```

`use_tag parser;` brings every global declaration tagged `parser` into unqualified
scope. It does not tag this file's own definitions. Multiple tags can be listed:

```l8
use_tag parser, lexer;
```

One matching tag is sufficient. A declaration carrying both `parser` and
`parser_internal` is available to a caller using either tag. File-level `tag` and
`use_tag` statements apply to the entire file, regardless of their position; place
them near the top for readability. Their scope does not propagate across imports.

To use a single name without activating a whole tag, qualify it:

```l8
parser::parse("hello");
```

This needs no `use_tag` statement. The compiler checks that the globally named
`parse` definition actually carries the `parser` tag. Qualification grants no
access to later unqualified references. It also bypasses local-variable shadowing
and always refers to a global declaration.

The same syntax works in type annotations, constructors, casts, `sizeof`, and
exception references:

```l8
value: parser::Tree = parser::Tree { count: 0 };
choice: parser::Kind = parser::Kind.Empty;
```

There is exactly one qualifier: `tag::name`. Tags have no nesting. Two different
definitions cannot have the same global name even if their tags are disjoint.
Several qualified spellings of one definition resolve to the same type, function,
global storage, and linker symbol. Extern names retain their foreign linker names.

Untagged declarations are valid but are not visible to any source-level reference,
even from their own file or body. There is no default global visibility. Add a
file tag or declaration tag to make a declaration accessible; `use_tag` alone
does not give declarations any tags. Unreferenced functions receive the existing
unused-function warning. The runtime entry point `main` is still selected by name,
so it needs no tag unless source code references it. Unused types, globals,
exceptions, and externs retain the existing warning behavior (no unused warning).

Builtins remain available without tags and cannot be qualified. Access checks
apply to explicit global-name references; tags do not restrict passing values,
inferring their types, or accessing their fields. An API may refer to types from another tag without duplicating those
types into every tag on the API.

## Files and vendored libraries

`import "file.l8";` continues to resolve relative to the importing file. Each
normalized path is loaded once, and import cycles are permitted. Existing
declaration-order requirements for types and global variables still apply. Tags
neither search for files nor change those requirements.

A root file can compose an application and its vendored dependencies:

```l8
import "vendor/parser/lib.l8";
import "src/main.l8";
```

`lib.l8` can import its own implementation files using relative paths. Application
files use the tags or explicit qualifiers they need. Package ownership, include
search paths, namespace imports, and export declarations are not needed.

An `_internal` suffix expresses the stability of an API and the intended audience.
Any file may deliberately use such a tag. The compiler prevents accidental
dependencies; it does not require the defining library's permission.

## Tools and bootstrap

`fmt` preserves tag directives, declaration modifiers, and qualified references
without loading imported files. `browse` links qualified and unqualified uses to
the same declaration. Access errors identify the referring file and name and list
the declaration's available tags.

The implementation is present in both compiler stages. Both use a `compiler_tags`
tag for the tag implementation itself and `compiler_internal` for the rest of the
tool. The checked-in bootstrap enforces tag visibility. Run `./build.sh selfhost`
to build `./l8`, verify the executable fixpoint, and run the positive, negative,
formatting, browsing, and assembly/direct-backend tests in `programs/examples/tags/`.
