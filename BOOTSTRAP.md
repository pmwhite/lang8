# Unified bootstrap model

`bootstrap` is a checked-in x86-64 Linux executable containing the complete `l8`
tool, including its runtime. Cold start simply copies it to `l8c0`; no host compiler,
assembler, or linker is required. Every stage provides `compile`, `as`, `elfpack`,
and direct `build` subcommands.

## Two source trees

| Directory | Role |
|-----------|------|
| `src1/` | Stage-1 unified source. It must be accepted by the current `bootstrap` executable. |
| `src2/` | Stage-2 unified source. It is compiled by the tool built from `src1/`, so it may use features implemented by stage 1. |

Both trees keep the compiler, assembler, ELF packer, common helpers, and command
dispatcher in separate `.l8` files. `main.l8` combines them with top-level imports.
Imports are relative to the importing file, share one namespace, include each
normalized path once, and permit cycles.

Declarations can carry overlapping [tags](tags.md) that control unqualified
visibility. `tag x;` tags a file's definitions and implicitly enables `use_tag x;`;
`tag x` before a definition adds a declaration-local tag. `use_tag x;` brings
tagged names into scope, while `x::name` accesses a single declaration explicitly.
Untagged declarations are valid but invisible to source references, including
references in their own file. Tags do not change global symbol identity or
relative import resolution. Both source stages use tags, and the saved bootstrap
enforces tag visibility when building them and programs.

`runtime.s` remains source input when building programs and successor compiler
stages, but it is already embedded in the saved bootstrap executable.

Typical evolution for a breaking language change:

1. Implement the feature in `src1/` without relying on it elsewhere in that tree.
2. Use the stage-1 tool to develop `src2/`, which may exercise the feature.
3. After the stage-2 fixpoint passes (`l8c3 == l8c4`), promote `src2/` over `src1/`
   and promote that executable to `bootstrap`.

## Unified command line

Function values, indirect calls, and C callbacks are supported by both source
stages. See
[`programs/callbacks/README.md`](programs/callbacks/README.md) for `fn` syntax,
ABI restrictions, and lifetime contracts. `./build.sh callback-test` builds the
stage-1 compiler and runs language, rejection, and C interoperability tests;
the test fixture needs a host C compiler and GNU assembler. Building L8 programs
with callbacks does not require a host compiler or adapter library.

```
l8 compile [--profile|-p] file.l8 > file.s
l8 unused file.l8 [file.l8 ...]
l8 boolint file.l8
l8 forlint file.l8
l8 as [-p|--profile] -o file.o file.s runtime.s
l8 elfpack file.o -o file
l8 build [--profile|-p] file.l8 -o file
```

`build` sends typed compiler operations directly to the assembler's in-memory
section, symbol, relocation, and instruction encoders. It parses only the static
`runtime.s` input, then writes ET_EXEC directly from that builder state; generated
assembly and ET_REL are never serialized or reparsed.

`unused` reports functions that are unreachable from every listed program.
Ordinary `compile` and `build` commands do not report unused functions.

`boolint` analyzes the complete typed import graph rooted at `file.l8` and reports
`int` variables, fields, parameters, and return values that are used only to carry
Boolean values. Numeric operations, non-Boolean literals, and external interfaces
exclude a value from the report.

`forlint` reports conservative `while`-loop candidates for ranged or collection
`for` loops. It recognizes an integer index advanced by one at the end of the
body, a stable upper bound, and no later use of the index. A collection suggestion
also requires the body's first statement to bind `xs[i]` and no other use of `i`.
It reports locations and suggested loop headers without rewriting source.

## Scripts (`./build.sh`)

| Command | What it does |
|---------|--------------|
| `bootstrap` | Copy the saved bootstrap executable to `l8c0` |
| `examples` | Build stage 1, then build and run examples with `l8c1` |
| `http` | Build the L8 HTTP/1.1 client and server in `.build/http/` (see `programs/http/README.md`) |
| `http-test` | Verify the downloaded RFCs and run the HTTP protocol, API, and socket tests |
| `terminal` | Build the OpenGL/FreeType terminal emulator in `.build/terminal` |
| `terminal-test` | Run terminal parser and static PTY tests, plus graphical integration tests when a display is available |
| `selfhost` | Directly build `l8c1` from `src1/`, build `l8c2/l8c3/l8c4` from `src2/`, require the `l8c3 == l8c4` executable fixpoint, run examples, and print compiler phase timings |
| `promote-bin1` | Promote the stage-1 executable to `bootstrap` |
| `promote-bin2` | Promote the stage-2 fixpoint executable to `bootstrap` |
| `promote-source` | Replace `src1/` with `src2/` without changing the bootstrap |
| `promote` | Promote both source tree and bootstrap executable |

Promotes require the corresponding self-host artifacts unless `--force` is used.
They update only the working tree; create the commit separately.

`--bench` runs each timed step ten times and reports average milliseconds.

## Pre-commit checks

Run `./.githooks/install.sh` once per clone to install the repository's pre-commit
hook without replacing other local Git hooks. The hook copies the staged tree to a
temporary directory, runs the default `./build.sh`, and requires every staged L8
file under `src2/` and `programs/` to match `l8c3 fmt` output. `src1/` is exempt
because it must remain compatible with the saved bootstrap. The deliberately
malformed fixtures listed in `.githooks/format-excludes` are exempt because the
formatter cannot parse them. Run `./l8c3 fmt -w path/to/file.l8` and stage the
result to fix a formatting failure.
