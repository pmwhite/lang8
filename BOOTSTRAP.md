# Bootstrap model

Cold start needs only a C toolchain (and the assembler/linker that come with it):

```
gcc -nostdlib -static -o l8c0 bootstrap.s runtime.s
```

`bootstrap.s` is a checked-in snapshot of the compiler’s own asm. It is **not**
updated on every commit — promotion is an intentional, isolated change.

## Two source copies

| File | Role |
|------|------|
| `compiler.l8` | Stage‑1 source. Must be accepted by the **current** `bootstrap.s`. Implement new language features here first (without yet *using* them in this file). |
| `compiler2.l8` | Stage‑2 source. Compiled by a compiler built from `compiler.l8`, so it may **use** features that stage‑1 only implemented. |

Typical evolution for a breaking language change:

1. Teach `compiler.l8` to parse/typecheck/codegen the new feature (still written in the old dialect).
2. Rebuild; use the resulting compiler to develop `compiler2.l8` (may use the new feature).
3. When stage‑2 is exercising the feature enough to trust it, **promote** in a dedicated commit:
   - `compiler2.l8` → `compiler.l8`
   - asm built from stage‑2 → `bootstrap.s`
4. Optionally promote **only** stage‑1 asm earlier if stage‑1 alone is already worth shipping and you need a faster bootstrap bump.

## Scripts (`./build.sh`)

| Command | What it does |
|---------|----------------|
| `bootstrap` | Link `bootstrap.s` + `runtime.s` → `l8c0` |
| `examples` | Run examples with `l8c0` |
| `selfhost` | `l8c0`→`compiler.l8`→`l8c1`, then `l8c1`→`compiler2.l8`→`l8c2`, then fixpoint `l8c2`→`l8c3`→`l8c4` (`l8c3.s` == `l8c4.s`), examples |
| `promote-asm1` | After a successful stage‑1 build, copy that asm over `bootstrap.s` |
| `promote-asm2` | Copy stage‑2 fixpoint asm (`l8c3.s`) → `bootstrap.s` |
| `promote-source` | Copy `compiler2.l8` over `compiler.l8` (does **not** touch asm) |
| `promote` | `promote-source` + `promote-asm2` (usual “stage‑2 is ready” commit prep) |

## Linking

L8 programs are assembled together with [`runtime.s`](runtime.s) (`as prog.s runtime.s -o prog.o`), then turned into a static ELF executable by [`elfpack.l8`](elfpack.l8) (no `ld`). Cold start still uses the host `gcc` driver once to link `l8c0` from `bootstrap.s` and once to link the first `elfpack` binary; after that, stage links and examples use `as` + `elfpack` only.

Promotes refuse to run unless the corresponding `./build.sh selfhost` artifacts exist (or you pass `--force`). They only update the working tree; **you** create the git commit.
