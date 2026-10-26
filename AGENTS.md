# Working in this repository

L8 is a self-hosted language. Read `BOOTSTRAP.md` for the compiler stages,
`TESTING.md` for compiler expect/cram tests, `RELOAD.md` for hot reload and
`persistent` globals, and the affected program's README.

Ask before editing `AGENTS.md` or creating extra documentation Markdown files,
unless the user explicitly requests those changes. Report findings in the
conversation by default.

## Fast feedback

- Run from the checkout root. Check `pwd`, `git status --short`, and the current
  files before editing; other T3 threads can have different branches/layouts.
- `make -j4 l8c3` builds a development compiler without the full test suite.
- Iterate with `./l8c3 test -j 2 path/to/test.l8`; use `--wasm` when changing
  portable code used on the web. Test files run all tests in their import graph.
- Only compiler test suites are retained: language/CLI/C ABI fixtures, backend
  checks, self-hosting and Wasm resume. Application, standard-library and UI
  suites were removed at the owner's request; do not recreate them unless asked.
  `make bible-web` builds `.build/bible-site`.
- `make .build/bible-ios.s .build/bible-ios-sim` builds iOS assembly and
  a simulator executable; it does not run the iOS UI.
- For compiler changes, use `make -j4 selfhost compiler-test` and add a small
  compiler regression fixture. For other apps, use the relevant `make help`
  target. Run broader checks when the changed dependency/behavior needs them.
- `make` formats src2, builds applications and runs compiler tests. `make check`
  does the same without formatting. Use focused build targets while iterating.
- **`make -n` is not side-effect-free here:** recipes marked `+` still execute,
  including test runners. Inspect the Makefile to inspect dependencies.

## Avoid repeat failures

- Format changed L8 files with `./l8c3 fmt -w path/to/file.l8`, then review and
  stage the result. Preserve UTF-8 text and original bytes in generated edits.
- Keep automated replacements small and assert each intended match. Compile
  after each structural edit before applying the same transformation widely.
- Inspect related lifetime, tag and record fixtures before inventing syntax.
  `str` and mutable `[]i8` are distinct; see `memory.md` and `tags.md`.
- If extracting types into cyclic imports, verify concrete field layouts with
  a minimal executable before migrating callers. One recent Bible refactor
  produced zero/wrong record fields and crashes until import order changed.
- Read failures before `test --accept`. Do not accept crashes or changed output
  merely to make a refactor pass; review each changed expectation.
- Steps write details to `.build/logs/STEP.log`. Read the failed step's log
  before repeating a whole build. Start with 2–4 jobs on a busy shared host.
- The tracked pre-commit hook validates a **fresh staged tree**: application
  builds, compiler tests and formatting across tracked L8 files. Local build
  stamps do not accelerate it. Read and reproduce a failed compiler check
  before attributing it to an app edit. Do not bypass the hook.
- CI triggers and paths live in `.github/workflows/`. Check those before waiting
  for artifacts from a documentation-only commit. Match artifact `RUN.txt` to
  its commit, and report which builds or checks were actually verified.

See `tools/development-workflow-audit.md` for measured costs and proposed fixes.
