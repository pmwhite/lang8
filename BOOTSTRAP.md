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
stages, but it is already embedded in the saved bootstrap executable. A library
can declare `native "relative/path.s"` to add assembly source to a direct
`build`. Native paths resolve relative to the declaring L8 file and duplicate
imports add each source once. An ordinary `extern` declaration can then name a
symbol defined by that source. `compile` emits only L8-generated assembly; if
assembling that output separately, include its native dependencies explicitly.

Typical evolution for a breaking language change:

1. Implement the feature in `src1/` without relying on it elsewhere in that tree.
2. Use the stage-1 tool to develop `src2/`, which may exercise the feature.
3. After the stage-2 fixpoint passes (`l8c3 == l8c4`), promote `src2/` over `src1/`
   and promote that executable to `bootstrap`.

## Unified command line

Function values, indirect calls, and C callbacks are supported by both source
stages. See
[`tests/callbacks/README.md`](tests/callbacks/README.md) for `fn` syntax,
ABI restrictions, and lifetime contracts. `make callback-test` builds the
stage-1 compiler and runs language, rejection, and C interoperability tests;
the test fixture needs a host C compiler and GNU assembler. Building L8 programs
with callbacks does not require a host compiler or adapter library.

```
l8 compile [--profile|-p] file.l8 > file.s
l8 unused file.l8 [file.l8 ...]
l8 boolint file.l8
l8 forlint file.l8
l8 unreachable file.l8
l8 unusedfields file.l8
l8 unusedassign file.l8
l8 as [-p|--profile] -o file.o file.s runtime.s
l8 elfpack file.o -o file
l8 build [--profile|-p] file.l8 -o file
l8 wasm [--profile|-p] file.l8 -o file.wasm
l8 test [--accept] [--wasm] [-j N] file.l8|file.t ...
```

`test` builds each file with its `test` declarations, runs them, and compares
their output with their `expect` statements; `.t` files are cram tests of
commands. See [`TESTING.md`](TESTING.md).

Both source stages and the saved bootstrap require a compile-time proof for
`a[i]` during `compile` and `build`, as described in [`BOUNDS.md`](BOUNDS.md).
Programs that signal invalid indexes explicitly must define their own
exception. The verifier and its performance improvements are present in
`src1/` and `bootstrap`.

`build` sends typed compiler operations directly to the assembler's in-memory
section, symbol, relocation, and instruction encoders. It parses only the static
`runtime.s` input and imported native sources, then writes ET_EXEC directly from
that builder state; generated
assembly and ET_REL are never serialized or reparsed.

`wasm` compiles a program to a WebAssembly module instead (see
[`web/README.md`](web/README.md)). The module keeps every type's layout and
imports each `extern` from the host by its link name; `native` assembly is not
included. `node web/run.mjs file.wasm args...` runs it, and `test --wasm` runs
tests that way. `make wasm-test` runs the test suites as modules and checks
that the compiler, built as a module, rebuilds itself unchanged under Node.

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

`unreachable` reports statements after guaranteed exits, branches guarded by
literal Boolean conditions, and loop bodies with statically empty ranges or
false conditions. It leaves ordinary compilation warnings unchanged.

`unusedfields` reports record fields that are initialized or written but never
read in the typed import graph. Records exposed through an `extern` signature
are omitted because external code can inspect their layout. Raw memory access and
uses outside the import graph are not modeled, so review findings before deletion.

`unusedassign` reports local initializers and assignments overwritten before a
read in straight-line code. It stops at branches and loops and omits locals whose
address is taken, since an alias might observe their value. It also finds
uninitialized declarations that can move to a later first assignment, including
simple `if` and `match` assignments on every arm. Intervening statements may do
other work, but must not reference the local. It does not change ordinary build
warnings.

## Building (`make`)

The `Makefile` describes every build and test step with its inputs, so
`make -jN` runs independent steps in parallel and a later run repeats only
the steps whose inputs changed. Each step prints one line with its time; its
full output is in `.build/logs/STEP.log`, and `make V=1` streams it instead.
Test runners take their parallelism from make's job slots.

| Target | What it does |
|--------|--------------|
| `all` (default) | Format `src2/` with `l8c2`, then everything in `check` |
| `check` | Stage-1 fixtures, `selfhost`, standard-library tests, and the block game and its tests |
| `selfhost` | Build `l8c1` from `src1/` and `l8c2/l8c3/l8c4` from `src2/`, require the `l8c3 == l8c4` fixpoint, check `src2` formatting, run the compiler fixtures and CLI cram tests under `tests/`, then install `./l8` |
| `fmt` | Format `src2/` with the stage-2 compiler |
| `install-bootstrap` | Copy the saved bootstrap executable to `l8c0` |
| `compiler-test` | Run the stage-1 fixture subset (`STAGE1_TESTS`) with `l8c1`, then every fixture and CLI cram test under `tests/` with `l8c3` |
| `stdlib-test`, `game`, `game-test` | Standard-library tests; build `.build/block-game` and run its tests |
| `http`, `http-test` | Build the L8 HTTP/1.1 client and server in `.build/http/`; verify the downloaded RFCs and run the protocol, API, and socket tests |
| `websocket`, `websocket-test` | Build and test the WebSocket client and server in `.build/websocket/` |
| `terminal`, `terminal-test` | Build the OpenGL/FreeType terminal emulator in `.build/terminal`; run parser and PTY tests, plus graphical integration tests when a display is available. Terminal tests always run |
| `callback-test` | Build stage 1 and run the C callback tests (needs `cc` and `as`) |
| `promote-bin1` | Promote the stage-1 executable to `bootstrap` |
| `promote-bin2` | Promote the stage-2 fixpoint executable to `bootstrap` |
| `promote-source` | Replace `src1/` with `src2/` without changing the bootstrap |
| `promote` | Promote both source tree and bootstrap executable |
| `clean` | Remove compilers and `.build/` |

Program and test steps use `l8c3`, so they run alongside the compiler tests;
`./l8` is installed only after those pass. Promotes first bring their
artifacts up to date and ask for confirmation unless `FORCE=1` is given.
They update only the working tree; create the commit separately.

## Profiling

`tools/profile.py` times the compiler self-build, the block game build, and
formatting `src2/`, reporting medians over alternating runs. `--baseline PATH`
compares another compiler, `--phases` adds the compiler's per-phase timings,
`--counters` adds `perf stat` cycles and instructions, and `--cpu N` pins the
runs. For example:

```sh
cp l8 .build/l8-before                      # before a change
make selfhost
tools/profile.py --baseline .build/l8-before --counters --cpu 3
```

## Pre-commit checks

Run `./.githooks/install.sh` once per clone to install the repository's pre-commit
hook without replacing other local Git hooks. The hook copies the staged tree to a
temporary directory, runs the default `make -j` target, and requires every staged L8
file under `src2/`, `stdlib/`, and `programs/` to match `l8c3 fmt` output. `src1/` is exempt
because it must remain compatible with the saved bootstrap. The deliberately
malformed fixtures listed in `.githooks/format-excludes` are exempt because the
formatter cannot parse them. Run `./l8c3 fmt -w path/to/file.l8` and stage the
result to fix a formatting failure.
