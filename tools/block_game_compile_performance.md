Block game compiler investigation (2026-09-28)

The latest [endpoint investigation](block_game_endpoint_performance.md)
measured 553 to 507 ms (another 8.3%) by embedding and borrowing numeric term
references and caching variable identity. It trades about 10 MiB of peak RSS
for fewer instructions and memory accesses. The report includes hardware
counters and rejected experiments.

The preceding [follow-up investigation](block_game_followup_performance.md)
measured 603 to 548 ms (another 9.1%) by reusing fact-table work, avoiding
unnecessary query construction, and improving generated indexing/length code.
Its report also identifies larger opportunities that remain unmeasured.

The preceding [hardware-guided round](block_game_hardware_performance.md) removes
repeated scalar-equality scans and groups graph-edge fields. Seven interleaved
builds measured 801 to 608 ms (24% faster), with about 30% fewer instructions.
The measurements below describe earlier rounds.

The subsequent cache investigation is recorded in
[verifier_cache_performance.md](verifier_cache_performance.md). It reduces
cached fact descriptors from 72 to 56 bytes and borrows them in hot read paths.
Peak build memory fell about 7%; timing improved slightly (827 to 820 ms).
The earlier rounds below retain their original measurements.

The slow build is dominated by bounds proof validation in block game's `main`.
The baseline reproduced the reported 1.452-second build at roughly 1.49 seconds.
The first change, preserving fact-table prefixes, reduced that to 1.327 seconds.
The second round added bounded graph reuse and sparse branch projections,
reaching 0.906 seconds. The third round adds query-distance reuse, explicit
interval shortcuts, and copied-prefix provenance. Seven interleaved direct
builds per compiler gave these median wall times for the latest round:

| Root | Before this round | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game | 908 ms | 832 ms | 8.3% |
| Compiler (`src2/main.l8`) | 270 ms | 270 ms | Essentially unchanged |
| Terminal | 180 ms | 180 ms | Essentially unchanged |

The final block game time is about 44% below the original 1493 ms measurement.
These are warm, full builds, not incremental builds. Phase medians below are
measured independently, so they need not add up exactly to the median total.

| Block game phase | Before this round | After |
| --- | ---: | ---: |
| Load/parse | 45.0 ms | 45.3 ms |
| Typecheck | 15.6 ms | 15.5 ms |
| Bounds inference | 114.2 ms | 111.8 ms |
| Bounds validation | 705.7 ms | 625.8 ms |
| Code generation | 21.0 ms | 21.2 ms |

Bounds work accounts for about 94% of the original build. Parsing the compiler's
own sources actually takes longer than parsing block game, but validating those
sources takes only about 88 ms. Project size alone does not explain this gap.

Temporary instrumentation of the original compiler attributed about 1126 ms of
validation to `main`; the next slowest individual function was about 8 ms. The
editor frame loop at `block-game.l8:1309` took about 968 ms inclusive of its nested
event loop. The play frame loop at line 1916 took about 164 ms. Their incoming
states contained 405 and 393 bounds facts respectively. The outer loops converged
in two iterations, and their nested event loops in one to three iterations.
These timings overlap and must not be summed.

The large function combines resource initialization, editor logic, play logic,
and nested event dispatch. Hundreds of facts survive into branches and calls,
which repeatedly filter and join them. This is an expensive large-state workload,
not excessive fixed-point iteration. `bounds_entry_needs_inference` deliberately
skips inference for an uncalled `main`, explaining why the validation phase is so
much larger than inference for this project.

Additional instrumented totals across inference and validation were:

| Operation | Calls | Inclusive time |
| --- | ---: | ---: |
| `bounds_meet` | 11,128 | 503 ms |
| `bounds_join_project` | 2,547 | 248 ms |
| `bounds_solve` | 35,217 | 369 ms |
| `bounds_graph_search` | 51,496 | 137 ms |
| `bounds_after_call` | 8,604 | 85 ms |
| `bounds_forget_scalar` | 6,387 | 64 ms |

These measurements include instrumentation overhead and nested calls. In
particular, joins include projection, and projection and solving include graph
search. They identify priorities, not additive phase totals. Hardware sampling
was unavailable because the host restricts perf events.

The implemented improvement preserves row order in filters and joins and shares
the unchanged prefix of a filtered fact table. Previously, filtering traversed
rows backwards and copied survivors, defeating the existing common-prefix join
optimization. `bounds_filter_copy` now shares surviving leading rows and uses the
existing copy-on-write machinery after a gap. Invalidation still discards
implications and applies the same row-removal and alias rules. No bounds checks
were disabled. The block game executable is byte-for-byte identical before and
after the change.

The follow-up adds two arena-owned graph caches with reusable search buffers.
Each key is a storage pointer plus its immutable prefix length. Arena reset
invalidates both keys before recycling any buffers. Two entries allow a join to
pin one predecessor while loading the other. Only occupied hash slots are
cleared when rebuilding a graph, and a cache hit skips full-table endpoint scans.
The cache accommodates states of up to 1024 rows; larger states, states without an
arena, and missing implicit length endpoints retain the complete query-local
fallback. This cap limits scratch memory, not the proofs the compiler accepts.

Branch projection now stops collecting terms when its existing eight-term limit
is filled. It also omits relations already implied by the result, avoiding
redundant rows in later states. Cached entailment makes this affordable; doing a
fresh graph build for each such query was slower in the original investigation.

The third round retains distances from the last source searched in each cached
graph. A completed search can answer subsequent queries directly. A partial
search can answer a proof only if it already found a sufficiently strong path;
tighter or exact requests rerun the search. Budget exhaustion never marks a
search complete, and graph replacement invalidates the remembered source.

An additional proof shortcut combines two explicit unconditional bounds through
zero, for example `x <= 8` and `y >= 3` proving `x - y <= 5`. Small-weight guards
make the addition safe. This is only a sufficient-proof shortcut: exact distance
queries still search the graph, and conditional alias facts cannot enter it.

Fact buffers now remember the exact prefix copied from their parent. Joins of
parent/child or sibling snapshots skip comparisons of those already known equal
rows, capped by each snapshot's length. Pool reuse clears this provenance.
Joins also skip recounting sum facts when the source has none.

Third-round experiments with incremental graph extension, batching all projected
relations, and always completing searches did not show a convincing additional
benefit and were not retained. The latest changes target repeated work without
altering the bounds proof requirements.

Validation passed: all compiler fixtures with the stage-2 and self-hosted
compilers, block game tests, standard-library tests, and a stage-3/stage-4 binary
fixpoint. The direct engine regression covers removal from the middle and tail
of a snapshot, hidden rows in shared hash buckets, and appending without changing
sibling snapshots. Follow-up regressions also check cache invalidation on buffer
reuse, pinned predecessor isolation, conditional alias edges, missing constant
length endpoints, oversized-state fallback, and exact cached distances against
an independent all-pairs reference on 40 generated feasible graphs with hash
collisions. Third-round regressions cover partial versus exact searches, tighter
queries, source changes, graph replacement, negative-cycle budget exhaustion,
interval shortcuts with conditional evidence, and parent/sibling prefix lengths.
`src1` and the saved bootstrap were not changed. The local `l8`
executable was rebuilt from the tested self-hosted compiler.

The larger remaining improvements, in recommended investigation order, are:

1. Reduce live proof state. Remove facts about dead locals at scope/last-use
   boundaries, preserving consequences between still-live terms when necessary.
   Separate invariant resource facts from frequently changing loop facts so each
   event branch need not process the full initialization state.
2. Reduce repeated branch projection work further. Graph reuse now removes
   repeated construction on hits, but branch joins still run multiple searches
   and compare many facts. Profile the new implementation before choosing the
   next representation change.
3. Split editor/play event handling into helpers with explicit state and bounds
   contracts. This would also improve the program's structure, but its performance
   benefit has not been measured and it should not substitute for compiler work.

In the first round, checking every projected relation with a fresh entailment
query was slower (about 1.84 s). A separate single-run prototype reached about
1.35 s. Neither was retained then. The follow-up's validated version combines
sparse projection with bounded graph reuse, avoiding those per-row rebuilds.

Reproduce direct-build comparison with the saved local baseline:

```sh
python3 tools/bench_bounds.py ./l8 --baseline .build/block-round3-baseline \
  --build --runs 7 --root programs/block-game/block-game.l8
./l8 build -p programs/block-game/block-game.l8 -o .build/block-game-profile
```

`--build` is new; the benchmark's default remains assembly compilation. Detailed
phase medians from the latest round are in `.build/block-benchmark-round3.json`,
with individual samples in `.build/block-benchmark-round3-samples.json` and the
exact runner in `.build/bench-round3.py`. Earlier results remain in
`.build/block-benchmark-round2.json` and `.build/block-benchmark-final.json`.
The baseline, samples, and temporary instrumented sources are local build
artifacts and will disappear if `.build` is cleaned.
