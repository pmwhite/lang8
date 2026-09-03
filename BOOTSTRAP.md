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

`runtime.s` remains source input when building programs and successor compiler
stages, but it is already embedded in the saved bootstrap executable.

Typical evolution for a breaking language change:

1. Implement the feature in `src1/` without relying on it elsewhere in that tree.
2. Use the stage-1 tool to develop `src2/`, which may exercise the feature.
3. After the stage-2 fixpoint passes, promote `src2/` over `src1/` and promote the
   deterministic stage-3 executable to `bootstrap`.

## Unified command line

```
l8 compile [--profile|-p] file.l8 > file.s
l8 as [-p|--profile] -o file.o file.s runtime.s
l8 elfpack file.o -o file
l8 build [--profile|-p] file.l8 -o file
```

`build` sends typed compiler operations directly to the assembler's in-memory
section, symbol, relocation, and instruction encoders. It parses only the static
`runtime.s` input, then writes ET_EXEC directly from that builder state; generated
assembly and ET_REL are never serialized or reparsed.

## Scripts (`./build.sh`)

| Command | What it does |
|---------|--------------|
| `bootstrap` | Copy the saved bootstrap executable to `l8c0` |
| `examples` | Build and run examples directly with `l8c0` |
| `selfhost` | Directly build `l8c1` from `src1/`, build `l8c2/l8c3` from `src2/`, require the `l8c2 == l8c3` executable fixpoint, run examples, and print compiler phase timings |
| `promote-bin1` | Promote the stage-1 executable to `bootstrap` |
| `promote-bin2` | Promote the stage-2 fixpoint executable to `bootstrap` |
| `promote-source` | Replace `src1/` with `src2/` without changing the bootstrap |
| `promote` | Promote both source tree and bootstrap executable |

Promotes require the corresponding self-host artifacts unless `--force` is used.
They update only the working tree; create the commit separately.
