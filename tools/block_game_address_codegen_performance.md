# Block-game address code generation (2026-10-03)

This round improves compiler-generated x86-64 code. It adds no native assembly
kernel and changes no verifier rules, search budgets, or game sources.
The baseline is the local self-hosted compiler at `b4d3a43`, saved as
`.build/oct-baseline`; the candidate is `.build/oct-final` (also local `l8`).
Neither `src1` nor the saved bootstrap is modified.

## Profiling

The initial full game build spent about 92% of its time in bounds inference
and validation. A separate hardware-counter run retired 10.16 billion
instructions. Source line count does not explain the difference from compiler
self-build time: the game generates much more bounds-analysis work.

Five cycle-sampling runs attributed 9.1% of self samples to graph search,
5.0% to condition-purity analysis, and 4.6% to fact storage. Five precise
retired L1-load-miss runs also placed graph search first (12.3%). These are
sampled self costs, not inclusive timings. The sampling executable was built
from baseline compiler sources using `compile`, GNU `as`, and `ld` to retain
function symbols. Its code placement differs from the direct-build executable;
all comparative timings and counter measurements below use direct builds.

The generated graph-search loop showed unnecessary push/pop pairs around
field assignments and binary field operands, plus separate additions to form
field addresses. The same patterns occur throughout the verifier.

## Changes

- Scalar field loads/stores use the field offset in the memory instruction.
- Simple assignment destinations are evaluated in `rdi`, preserving the
  already-evaluated right-hand side in `rax` without stack saves.
- Field operands of binary operations load directly into the operand register.
- Simple array addresses use the destination register and one scratch register,
  avoiding transfers through the generic expression stack.

The fast address path handles locals, nested fields, dereferences, and array
indices that are local variables or constants. It emits no calls or writes.
Unsupported expressions retain the existing general path. Assignments still
evaluate the RHS before the destination, and binary operations still evaluate
the left operand first. Scalar widths and sign/zero extension are preserved;
aggregate assignments retain the copy path.

For example, assigning a scalar to a pointer's field now needs a value load,
a pointer load, and a store with displacement. The old sequence also pushed
the value, computed the field address separately, moved the address, popped
the value, and moved it back to the return register.

## Build measurements

Fifteen warm builds per compiler alternate order, pinned to logical CPU 2 of
an Intel Core i5-8365U. Both compilers build identical current sources. Timing,
tests, hardware sampling, and counter collection run separately.

| Root | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game | 1189.3 ms | 1134.6 ms | 4.6% |
| Compiler | 399.6 ms | 384.2 ms | 3.9% |
| Terminal | 874.6 ms | 851.9 ms | 2.6% |

Game inference falls from 417.0 to 403.3 ms and validation from 677.2 to
643.7 ms. Phase medians need not sum to the median total. Earlier seven-pair
runs measured a similar 4.5% overall improvement; absolute timings varied.

Three separate peak-RSS measurements have medians of 556352 and 556192 KiB,
essentially unchanged. The game executable shrinks from 710435 to 673571 bytes
(36 KiB, 5.2%). The local compiler shrinks from 721675 to 697198 bytes (3.4%),
including the added code-generation helpers.

## Hardware counters

Seven alternating runs per event group use user-space events on CPU 2. All
counters reported full running coverage. Counts cover the whole game build.

| Event | Before | After | Change |
| --- | ---: | ---: | ---: |
| `cycles` | 4,341,514,688 | 4,166,949,261 | -4.0% |
| `instructions` | 10,156,089,657 | 9,285,269,564 | -8.6% |
| `L1-dcache-loads` | 3,613,373,541 | 3,497,482,058 | -3.2% |
| `L1-dcache-stores` | 2,128,537,480 | 2,013,203,680 | -5.4% |
| `L1-dcache-load-misses` | 56,774,500 | 56,698,917 | -0.1% |
| `mem_load_retired.l1_miss` | 19,258,881 | 19,308,740 | +0.3% |
| `mem_load_retired.l2_miss` | 3,397,889 | 3,421,961 | +0.7% |
| `mem_load_retired.l3_miss` | 322,497 | 325,325 | +0.9% |
| `branch-misses` | 10,861,493 | 10,494,250 | -3.4% |
| `cycle_activity.stalls_total` | 481,209,857 | 486,666,388 | +1.1% |

Cycles fall 3.8–4.4% across the groups. The 8.6% instruction reduction and
lower load/store traffic support the timing result. Cache misses are largely
unchanged, and the total-stall event rises 1.1%; this is reduced executed work,
not evidence of better memory locality. Generic cache counters and retired
load-miss counters measure different activity and should not be combined into
one miss rate. Substantial bounds-analysis work remains: these changes improve
the code executing that work, rather than reducing its algorithmic complexity.

## Validation

`./build.sh` passes, including compiler/callback fixtures, formatting,
stage-3/stage-4 binary fixpoint, browse checks, standard-library tests,
game build, and game tests. Six C callback tests and terminal library tests
pass separately.

`tests/compiler/codegen_addresses.l8` covers signed/unsigned narrow fields,
floating-point fields, nested records and pointers, pointer redirection during
RHS evaluation, side effects in destination evaluation, scalar and aggregate
array elements, nontrivial-index fallback, globals, dereferences, and aggregate
copies. It passes with both baseline and candidate, and the candidate's textual
assembly passes through GNU `as`/`ld` and executes successfully.

## Reproduction

Temporary timing runner and raw samples: `.build/bench-oct-final.py` and
`.build/oct-final-bench.json`. Sampling results: `.build/oct-sample-functions.json`.
Full validation log: `.build/oct-full-build.log`. These scratch artifacts are
removed when `.build` is cleaned.

```sh
python3 tools/bench_perf.py .build/oct-final --baseline .build/oct-baseline \
  --root programs/block-game/block-game.l8 --cpu 2 --runs 7 \
  --group overall --group l1 --group retired-loads --group branches --group stalls \
  --output .build/oct-final-perf.json
```
