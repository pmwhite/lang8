# Working in this repository

L8 is self-hosted. Read [BOOTSTRAP.md](BOOTSTRAP.md) for compiler stages,
[TESTING.md](TESTING.md) for expect/cram tests, [RELOAD.md](RELOAD.md) for
hot reload, and the affected program's README.

## Build and check

- Start at the checkout root: inspect `pwd`, `git status --short` and the
  current files before editing. Other threads may use different checkouts.
- `make -j4 l8c3` builds the development compiler. Use 2–4 jobs on a shared host.
- Iterate with `./l8c3 test -j 2 path/to/fixture.l8`; it runs every test in
  that file's import graph. Use `--wasm` for portable compiler behavior.
- Compiler changes need `make -j4 selfhost compiler-test` and a small
  regression fixture. Use focused application build targets from `make help`.
- Only compiler suites are retained: language, CLI, C ABI, backend,
  self-hosting and Wasm resume/reload checks. Do not recreate application,
  standard-library or UI suites unless asked.
- `make bible-web` builds `.build/bible-site`;
  `make .build/bible-ios.s .build/bible-ios-sim` builds assembly and a
  simulator executable. These do not run the UI.
- `make` formats `src2/`, builds applications and tests the compiler.
  `make check` omits formatting. Read failed `.build/logs/STEP.log` before retrying.
- `make -n` can execute recipes marked `+`, including test runners.
  Inspect the Makefile directly to inspect dependencies.

## Editing

- Follow [STYLE.md](STYLE.md) for code style; existing code is not the standard.
- Keep replacements small, assert intended matches and preserve original
  bytes. Compile after structural edits before repeating them widely.
- Format changed L8 files with `./l8c3 fmt -w path/to/file.l8`, then review
  the diff. Keep `src1/` compatible with the saved bootstrap.
- Inspect existing fixtures before inventing syntax. `str` and mutable
  `[]i8` differ; see [memory.md](memory.md) and [tags.md](tags.md).
- When changing cyclic imports, verify concrete field layouts in a small
  executable before migrating callers.
- Read failures before `test --accept`; never accept crashes or unexplained changes.
- The pre-commit hook builds a fresh staged tree and checks tracked L8
  formatting. Local build stamps do not speed it up. Do not bypass it.
- Inspect `.github/workflows/` for CI triggers. Match artifact `RUN.txt` to
  its commit and report which builds or checks were actually verified.
- Document current behavior and contracts. Keep temporary notes, completed
  reviews and generated benchmark reports out of tracked source.
