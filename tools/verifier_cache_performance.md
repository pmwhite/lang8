Verifier cache investigation (2026-09-28)

The [subsequent hardware-guided round](block_game_hardware_performance.md)
implements the scalar-scan improvement suggested below, reaching about 608 ms.
The measurements in this report describe the preceding descriptor-layout round.

The verifier benefits from moving less data, but this change gives a modest
compile-time improvement. For block game, seven interleaved warm direct builds
measured 827.5 ms before and 820.0 ms after (0.9%). Three separate peak-RSS
measurements per compiler had medians of 311432 and 289196 KiB (304.1 and
282.4 MiB), a 7.1% reduction. The game executable is byte-identical.

The baseline is the compiler after the third performance round, saved locally
as `.build/block-cache-baseline`. The final self-hosted compiler is
`.build/block-cache-final-stage3`. These are full builds, not incremental builds.

Representation changes

`BoundsNumericView` mixed pointer fields with boolean groups, introducing
padding. Grouping its word-sized fields before its booleans reduces the
measured native size from 72 to 56 bytes (22.2%). Cached numeric descriptors
remain in a dense array alongside fact rows. Both retained storage and the
amount of data initialized/copied when branch snapshots grow are reduced.
A 56-byte descriptor can still straddle cache lines; this is a footprint
reduction, not a guarantee that each descriptor fits within one line.

Direct evidence lookups, graph loading, and endpoint checks now borrow numeric
descriptors instead of returning the whole record by value and copying it
again into term accessor calls. `bounds_numeric_ref` checks the snapshot count,
not just backing-array capacity, so a later sibling's facts remain invisible.
Callers only read these pointers and do not retain them across arena reset.

A separate prototype packed graph adjacency lists into contiguous ranges.
Five-run medians were 819.2 ms without packing and 820.4 ms with it, so that
change was discarded. Its extra packing work and buffers did not produce a
measurable benefit for this workload.

Hardware measurements

The host is an Intel Core i5-8365U with 32 KiB L1 data cache and 256 KiB L2 per
core, and 6 MiB shared L3. Hardware profiling initially failed at
`kernel.perf_event_paranoid=3`. After the user changed it to 2, user-space
counters became available.

Each event group below was measured in seven alternating baseline/current
runs, reversing their order each round, pinned to logical CPU 2. Each group
used at most three programmable events plus cycles/instructions. Perf reported
100% running time for every event; no multiplex scaling was required. These
are whole-compiler counts, including parsing and code generation. Bounds
analysis dominates this workload, but these are not verifier-only counters.
Tests and cache simulation were finished before these measurements began.

| Hardware event | Before | After | Change |
| --- | ---: | ---: | ---: |
| `instructions:u` | 8,110,577,526 | 7,956,479,327 | -1.9% |
| `cache-references:u` | 46,661,754 | 39,821,611 | -14.7% |
| `cache-misses:u` | 7,064,739 | 6,599,009 | -6.6% |
| `L1-dcache-loads:u` | 2,411,600,697 | 2,347,284,386 | -2.7% |
| `L1-dcache-load-misses:u` | 27,854,364 | 25,555,480 | -8.3% |
| `L1-dcache-stores:u` | 1,419,980,106 | 1,344,207,907 | -5.3% |
| `l2_rqsts.references:u` | 66,921,717 | 60,098,528 | -10.2% |
| `l2_rqsts.rfo_miss:u` | 1,500,647 | 1,440,716 | -4.0% |
| `mem_load_retired.l1_miss:u` | 8,808,994 | 8,573,673 | -2.7% |
| `mem_load_retired.l2_miss:u` | 2,493,926 | 2,173,264 | -12.9% |
| `mem_load_retired.l3_miss:u` | 298,588 | 305,050 | +2.2% |

Generic cache events and retired-load events count different activity and must
not be substituted for one another. The retired L3 read-miss count is roughly
unchanged. The evidence supports reduced data traffic and footprint, not a
large reduction in costly reads that miss every cache. Cycle reductions across
the four event groups ranged from 0.1% to 3.7%; the small native timing gain
should not be presented as a large or universal speedup.

Sampling the final compiler

Five builds sampled precise `mem_load_retired.l1_miss:upp` events at period 5000,
and five separate builds sampled cycles at period 2000000. A temporary packer
exported global text-symbol addresses while emitting a compiler verified
byte-identical to the measured executable. Samples were attributed to the
containing function; these are self samples, not inclusive caller costs.

Among 8450 precise L1-miss samples, `bounds_path_hash` accounted for 17.1%,
`bounds_term_local_value` for 10.0%, `bounds_storage` for 5.0%, and
`bounds_graph_search` for 4.2%. Among 7551 cycle samples, `bounds_row` and
`bounds_graph_search` each accounted for about 14.5%, with
`bounds_scalar_class_has` at 9.7%.

The next cache-specific candidate is avoiding repeated walks through AST nodes
when hashing and classifying terms. Compact canonical term IDs or cached hashes
could address that, but their own storage cost needs measurement. Repeated
scalar-class scans also deserve investigation: reducing the number of row
visits may matter more than changing the graph's edge layout. These are future
candidates, not measured improvements in this patch.

Cache simulation

Before hardware access was enabled, Valgrind Cachegrind 3.19 was extracted
locally under `.build/cache-tools`. A rerun on the final compiler produced:

| Simulated whole-build counter | Before | After | Change |
| --- | ---: | ---: | ---: |
| Data accesses | 3,855,976,181 | 3,715,988,298 | -3.6% |
| L1 data misses | 23,888,387 | 21,136,417 | -11.5% |
| Last-level data misses | 6,134,265 | 5,750,251 | -6.3% |

About 83% of baseline simulated last-level data misses were writes. This
motivated reducing allocations, initialization and copying. Simulation counts
are separate from actual hardware counts and should not be used as hardware
miss rates or latency measurements.

Validation and reproduction

All compiler/callback fixtures, block-game tests, and standard-library tests
passed with the final self-hosted compiler. Stage-3 and stage-4 compiler binaries
match. The engine regression checks borrowed rows, shared-prefix identity,
negative/null accesses, and exclusion of a sibling's appended row from an older
snapshot. Existing randomized graph/distance tests and conditional-evidence
checks also pass. No bounds-proof requirements changed.

Seven-run wall-time medians on other roots were 278.2 to 274.3 ms for
`src2/main.l8` and 184.1 to 176.8 ms for terminal. Native timing ran separately
from performance-counter collection and simulation.

```sh
python3 tools/bench_bounds.py ./l8 --baseline .build/block-cache-baseline \
  --build --runs 7 --root programs/block-game/block-game.l8
perf stat -e '{cycles:u,instructions:u,cache-references:u,cache-misses:u}' \
  taskset -c 2 ./l8 build programs/block-game/block-game.l8 -o .build/cache-game
perf stat -e '{cycles:u,instructions:u,mem_load_retired.l1_miss:u,mem_load_retired.l2_miss:u,mem_load_retired.l3_miss:u}' \
  taskset -c 2 ./l8 build programs/block-game/block-game.l8 -o .build/cache-game
```

Exact local runners and results are `.build/bench-cache.py`,
`.build/block-benchmark-cache*.json`, `.build/block-cache-memory.json`,
`.build/perf-cache.py`, `.build/perf-cache-samples.json`,
`.build/cache-sample-functions.json`, and `.build/cachegrind-{before,final}.out`.
These temporary artifacts and saved compilers disappear if `.build` is cleaned.
