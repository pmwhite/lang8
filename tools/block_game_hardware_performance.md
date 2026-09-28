Hardware-guided block-game compiler improvements (2026-09-28)

This round reduces a warm full build of block game from 801 to 608 ms, about
24%. It follows the descriptor-layout improvements documented in
[verifier_cache_performance.md](verifier_cache_performance.md). The comparison
uses the same source tree with the compiler saved at the start of this round
and the final self-hosted compiler. Seven interleaved runs per root measured:

| Root | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game | 801.3 ms | 607.7 ms | 24.2% |
| Compiler (`src2/main.l8`) | 278.6 ms | 269.6 ms | 3.2% |
| Terminal | 178.7 ms | 170.8 ms | 4.4% |

Block game's bounds-validation phase fell from 603.1 to 413.4 ms. Inference
was 108.3 to 106.5 ms; parse/typecheck/code generation were largely unchanged.
Phase medians are independent and do not necessarily sum to the median total.
Peak RSS was essentially unchanged: 289448 to 289016 KiB, the medians of three
separate runs. The final time is about 59% below the original 1493 ms measurement
from the first investigation, although that historical measurement was not
repeated alongside this round.

Changes and reasoning

The earlier hardware cycle sample attributed about 14.5% of cycles to
`bounds_row` and 9.7% to `bounds_scalar_class_has`. Scalar equality closure was
repeatedly walking every fact to test membership, even though very few rows
belonged to the class. A fact table with hundreds of unrelated bounds made
these nested scans expensive.

`BoundsScalarClass` now records reached equality-row indices in a dense array.
Membership scans just those rows. The outer closure scan still handles arbitrary
insertion order, but skips rows whose endpoints have already been reached. A
row is added at most once, both endpoints become reachable together, and the
fixed point preserves the original proof semantics. The small index array grows
as needed; it stores indices into the original snapshot rather than borrowed
AST pointers. One visited bit per row replaces two endpoint bits.

An isolated seven-run comparison for this change measured 804 to 617 ms. Its
hardware measurements removed about 27% of instructions and loads while L1
load misses barely changed. This identifies unnecessary repeated work on cached
data as the main cost of these scans.

Graph edges now store target, weight, and next-edge index in one 24-byte record.
Traversal borrows the record with one checked access instead of checking three
separate arrays. Linked adjacency order, work budgets, arithmetic limits, and
partial/exact search semantics are unchanged. This differs from the rejected
adjacency-packing experiment in the previous round: it requires no sorting or
extra copying. On top of the scalar change, it removed another 3.5% of
instructions; its isolated wall-time gain was smaller, about 1%.

Hardware counters

Measurements used the same Intel Core i5-8365U host with
`kernel.perf_event_paranoid=2`. Each compiler was warmed once, then measured
seven times per event group, pinned to logical CPU 2, alternating order each
round. Events counted user-space activity only. Perf reported 100% running
coverage; the benchmark rejects missing or multiplexed counters. Tests, timing,
and sampling ran separately from counter collection.

The following are median whole-build counts, including non-verifier phases.
All listed events used the `:u` modifier.

| Event | Before | After | Change |
| --- | ---: | ---: | ---: |
| `cycles` | 2,999,880,394 | 2,230,931,497 | -25.6% |
| `instructions` | 7,956,328,797 | 5,574,956,597 | -29.9% |
| `L1-dcache-loads` | 2,347,386,007 | 1,639,204,378 | -30.2% |
| `L1-dcache-stores` | 1,344,191,454 | 1,006,409,430 | -25.1% |
| `branches` | 924,739,684 | 651,209,946 | -29.6% |
| `branch-misses` | 4,119,365 | 3,813,457 | -7.4% |
| `L1-dcache-load-misses` | 24,779,686 | 24,160,928 | -2.5% |
| `mem_load_retired.l3_miss` | 290,185 | 277,374 | -4.4% |
| `cycle_activity.stalls_total` | 256,420,658 | 233,619,901 | -8.9% |
| `cycle_activity.stalls_l3_miss` | 49,481,290 | 47,195,897 | -4.6% |

Across the five event groups, total cycles decreased about 25%. Cache and
branch misses fell much less than instruction/load/branch counts. Most of the
speedup comes from avoiding repeated computation and cache-hit traffic. Looking
only at miss percentages would obscure that result: the denominator shrinks
substantially when unnecessary accesses disappear. The stall events count
specific Intel execution-stall conditions; they are not an exhaustive breakdown
of elapsed cycles.

Remaining profile

Five final builds were sampled for cycles at period 2000000 and five for precise
`mem_load_retired.l1_miss:upp` events at period 5000. A temporary packer exported
function addresses while producing a compiler verified byte-identical to the
measured executable. The percentages below are approximate self samples, not
inclusive caller costs.

Of 5580 cycle samples, scalar-class membership fell to 0.05%, and `bounds_row`
to 3.05%. Graph search remains the largest single function at 14.77%; the two
by-value term-view accessors together account for 6.65%. Those are useful next
targets for reducing per-query and per-edge work.

Of 7843 precise L1-miss samples, term hashing accounts for 19.27% and local-term
classification for 10.60%, while graph search accounts for 1.64%. Hashing and
classification together account for only about 2.7% of cycle samples. Their
miss counts alone do not establish that they offer the largest speedup.

Validation

All compiler/callback fixtures, block-game tests, standard-library tests, and
terminal library tests passed. Stage-3 and stage-4 compiler binaries are
identical. Baseline and current game executables are byte-identical.

New engine tests cover reverse-order equality chains, cycles, disconnected
components, shared-snapshot isolation, and inequality propagation through two
classes. Twelve generated equality graphs are checked against an independent
all-pairs reachability calculation, with unrelated numeric facts interspersed.
Existing graph tests cover randomized distances, negative edges, collisions,
conditional facts, implicit lengths, search budgets, and cache reuse. Bounds
proof requirements and the saved bootstrap are unchanged.

Reproduction

`tools/bench_perf.py` is a reusable counter benchmark. It alternates compilers,
optionally pins a CPU, supports separate event groups, rejects unusable counter
results, and saves both samples and medians. The `retired-loads` and `stalls`
groups use Intel-specific events; check `perf list` on other machines.

```sh
python3 tools/bench_bounds.py ./l8 --baseline .build/block-scalar-baseline \
  --build --runs 7 --root programs/block-game/block-game.l8
python3 tools/bench_perf.py ./l8 --baseline .build/block-scalar-baseline \
  --root programs/block-game/block-game.l8 --cpu 2 --runs 7 \
  --group overall --group l1 --group retired-loads --group branches --group stalls \
  --output .build/perf-hw.json
```

The exact interleaved timing runner and samples are `.build/bench-hw.py` and
`.build/block-benchmark-hw*.json`. Hardware results are in `.build/perf-hw.json`;
final function samples are in `.build/hw-sample-functions.json`. Isolated
scalar/edge experiments are `.build/perf-scalar-samples.json` and
`.build/perf-edge-samples.json`. All `.build` artifacts are temporary and will
be lost when that directory is cleaned.
