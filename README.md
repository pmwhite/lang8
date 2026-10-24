# L8

L8 is a self-hosted language with native x86-64, AArch64 and WebAssembly
backends. Its compiler, assembler, linker, formatter and test runner are
written in L8. The checked-in `bootstrap` executable starts the build on
x86-64 Linux without a host compiler toolchain.

## Build and run

Run commands from the checkout root:

```sh
make -j4 l8c3
./l8c3 build programs/tree-calculus/main.l8 -o .build/tree-calculus
printf '21100\n2100\n' | .build/tree-calculus
# 2100
make -j4 selfhost compiler-test
```

`l8c3` is the development compiler. `selfhost` checks the stage-3/stage-4
fixpoint, formatting and compiler fixtures before installing `./l8`.
`make check` also builds applications; `make` formats `src2/` first.
`make help` lists focused targets. Build logs are in `.build/logs/`.

Graphical applications need their platform libraries and a display. Optional
checks need Node for WebAssembly, a C toolchain for C ABI tests, or LLVM and
QEMU for AArch64 checks. The relevant docs describe those paths.

## Repository

- `src1/`, `src2/`: compiler stages; see [BOOTSTRAP.md](BOOTSTRAP.md).
- `runtime*.s`, `stdlib/`: runtimes and [standard output helpers](stdlib/README.md).
- `programs/`: [libraries and applications](programs/README.md).
- `tests/`: [compiler, CLI and C ABI fixtures](tests/README.md).
- `web/`: [browser hosts and WebAssembly tooling](web/README.md).
- `tools/`: build, platform and performance tools.

## Language and development

- [Code style](STYLE.md)
- [Tags and imports](tags.md)
- [Memory, lifetimes, strings and byte slices](memory.md)
- [Bounds checks](BOUNDS.md)
- [Expect and cram tests](TESTING.md)
- [Hot reload and persistent globals](RELOAD.md)
- [Repository working instructions](AGENTS.md)

Keep documentation about current behavior, commands and contracts. Completed
plans, review rounds and saved benchmark reports belong in Git history;
generated reports belong under `.build/`.
