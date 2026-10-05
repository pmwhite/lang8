# Compiler tests

Each compiler fixture tested by `make` keeps its expected behavior in trailing L8
comments. A successful program uses:

```l8
//% test: run
//% stdout: "Hi\n"
//% exit: 0
//% bootstrap: true
```

`stdout` is exact, including trailing newlines. Runtime `stderr` is expected to
be empty unless a `//% stderr: "..."` line specifies it. Strings are JSON
strings, so use `\n`, `\t`, and `\\` for escapes. The exit status must be an
integer from 0 through 255.
Compiler warnings are expected to be absent unless a
`//% compiler-warnings: ["warning message", ...]` line lists their messages in
emission order. Source paths and locations are omitted so formatted copies of
a fixture use the same expectations. An unexpected warning fails the test.
Add `//% bootstrap: true` only when the fixture also works with the stage-1
compiler. The stage-2 run includes every discovered fixture.

The stage-2 compiler verifies bounds for every fixture. Bounds-specific fixtures
are omitted from the bootstrap-only run unless marked `//% bootstrap: true`.

A program that should fail compilation uses:

```l8
//% test: compile-fail
//% error-contains: "assignment type mismatch"
```

The runner requires a nonzero compiler exit status and a diagnostic containing
that literal text. Put the comments at the end so they do not shift source
locations in diagnostic tests. The compiler ignores them; the files remain
directly runnable and can keep relative imports.

Run an individual test from the repository root with:

```sh
python3 tools/expect.py ./l8c3 .build/expect tests/compiler/hello.l8
```

Run all annotated tests, or list what would run, with:

```sh
python3 tools/expect.py ./l8c3 .build/expect \
  --discover tests/compiler --discover tests/callbacks
python3 tools/expect.py ./l8c1 .build/expect \
  --discover tests/compiler --bootstrap-only --list
```

The runner scans `.l8` files recursively, selects files with `//%` directives,
and runs them in sorted order. Adding an annotated file needs no build
entry. `make` runs the stage-1 subset and the full stage-2 set. Formatting,
warning-location, and other multi-step checks live in `tools/compiler_checks.sh`.

The bounds fixtures cover proof-required indexing, unreachable accesses,
loop revisits, address-taking, and nested accesses. Older bounds-failure
fixtures deliberately retain unproved `[]`; declaring or catching
`IndexOutOfBounds` does not authorize them. A separate fixture verifies that
the removed runtime-check syntax is rejected.
