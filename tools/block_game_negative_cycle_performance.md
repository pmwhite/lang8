Block-game negative-cycle investigation (2026-09-28)

This follows the [budget-distribution investigation](bounds_search_budget_distribution.md).
The 99% successes really are tied to the cutoff. Recognizing their underlying
contradictions during branch merging removes them and reduces game build time
by another 8.9%. The baseline is `5beb308`, saved as
`.build/block-cycle-baseline`.

Why the cutoff moves with the budget

An all-distance predecessor search walks a negative cycle until its budget
expires. The join takes those finite, partial distances as candidate bounds.
Its redundancy searches then traverse a similar graph to rediscover the same
cutoff-dependent bounds. Changing the budget changes both the amount of work
and the question subsequently asked.

| Budget multiplier | Late successes | Edge visits per late success | Budget used |
| --- | ---: | ---: | ---: |
| 0.25 | 16 | 7,067–7,749 | 97.50–99.65% |
| 0.5 | 16 | 14,349–15,362 | 98.65–99.12% |
| 1 | 16 | 28,913–30,919 | 99.34–99.80% |
| 10 | 16 | 289,410–310,283 | 99.75–99.83% |

All four runs retain the same array-access classifications. Smaller budgets
do not establish a safe general replacement budget; they demonstrate why this
particular group of searches stays near its cutoff.

The exceptional missed redundancy proof

The original trace identifies predecessor searches 31722 and 31723. Their
budgets are 34,240 and 34,112 visits; both stop with an upper bound of 8,701 for
`len(ramps)`. The joined graph has 140 nodes and 372 edges, so its budget is
only 32,832 visits. It is then asked to reproduce that 8,701 bound.

Replaying that exact graph and query shows:

| Edge visit | Upper bound reached |
| ---: | ---: |
| 120 | 8,800 |
| 461 | 8,799 |
| 802 | 8,798 |
| 32,515 | 8,705 |
| 32,832 | Budget expires; still 8,705 |
| 32,856 | 8,704 |
| 33,879 | 8,701; proof succeeds |

Each decrease by one costs another 341 edge visits. A recorded two-edge cycle
asserts `move_sel <= -1` and `move_sel >= 0`; its effect repeatedly propagates
across the reachable graph. This is repetitive relaxation under contradictory
premises, not the discovery of a long, difficult finite shortest path. The
slightly smaller joined-graph budget stops four decreases short.

On that same captured graph, searching from zero back to zero for a bound of
-1 certifies the contradiction after 140 visits. The same zero-source test
finds a certificate in 133–140 visits on all 16 captured late-success graphs.
Some original query sources cannot be reached back from the cycle; returning
to that particular source is therefore only an opportunistic cycle test.

The implementation

Join projection already performs one search per selected source. It now asks
each of those searches to stop if it establishes `source - source <= -1`.
That is a witnessed negative closed walk. All edges loaded into these graphs
are unconditional, so their conjunction is impossible. Joining an impossible
predecessor with another state retains the other state in full, including its
implications. The original immutable snapshots are not mutated.

The projection reports which predecessor is impossible, and `bounds_meet`
selects the surviving snapshot. No separate cycle-detection pass or search
workspace is added. Consistent graphs still compute all selected distances;
zero-weight cycles do not trigger the test. Search budgets and sentinel
handling remain unchanged. Conditional separation edges cannot certify a
contradiction because graph loading excludes them.

This handles the contradiction before it generates arbitrary finite bounds
for later redundancy checks. It does not merely solve those generated queries
faster or accept a negative-cycle hint without evidence.

Observed search work

| Metric | Before | After |
| --- | ---: | ---: |
| Searches | 42,682 | 42,381 |
| Edge visits | 6,658,833 | 3,642,492 |
| Budget exhaustions | 178 | 11 |
| Late successful searches (>90% of budget) | 16 | 0 |

Edge visits fall 45.3%. Twenty contradictory predecessors are recognized in
2–141 visits each. All 2,538 game array-access classifications are unchanged.
The original missed redundancy query is no longer generated.

Ten remaining exhaustions are projection sources that reach a cycle but have
no return path to their starting node; a later selected source detects the
contradiction. The eleventh is the separate length-relative overflow query
with an unreachable target discussed in the previous report. This change is
not complete negative-cycle detection; those searches retain the bounded
fallback.

Native build measurements

Seven warm builds per compiler alternate order and run on logical CPU 2 of the
Intel Core i5-8365U. Timing runs are separate from instrumentation, hardware
counter collection, and tests. Both compilers build the same current sources.

| Root | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game | 517.6 ms | 471.6 ms | 8.9% |
| Compiler | 245.6 ms | 241.0 ms | 1.9% |
| Terminal | 138.1 ms | 136.8 ms | 0.9% |

Game bounds validation falls from 341.0 to 296.8 ms. Peak RSS medians from
three separate runs are 291976 and 292948 KiB, about 0.9 MiB higher (+0.3%).
The small compiler and terminal timing changes should not be read as major
improvements on those workloads.

Hardware counters

Seven alternating user-space runs per group used CPU 2. Every event had full
running coverage. Counts cover the whole build.

| Event | Before | After | Change |
| --- | ---: | ---: | ---: |
| `cycles` | 1,840,506,830 | 1,680,283,636 | -8.7% |
| `instructions` | 4,606,997,322 | 4,139,676,559 | -10.1% |
| `L1-dcache-loads` | 1,341,361,373 | 1,210,668,643 | -9.7% |
| `L1-dcache-stores` | 720,083,269 | 673,078,676 | -6.5% |
| `mem_load_retired.l1_miss` | 6,085,689 | 6,031,415 | -0.9% |
| `mem_load_retired.l2_miss` | 1,441,354 | 1,438,881 | -0.2% |
| `mem_load_retired.l3_miss` | 284,618 | 285,609 | +0.3% |
| `branches` | 576,482,550 | 522,377,804 | -9.4% |
| `cycle_activity.stalls_total` | 206,472,124 | 195,383,706 | -5.4% |

The improvement is primarily less repeated computation. Retired load misses
are nearly unchanged; repeatedly traversing these graphs was largely hitting
cached data. Lower instructions, loads, branches, and cycles corroborate the
native timing result.

Validation and artifacts

The full `./build.sh` passes, including compiler fixtures, formatting, the
stage-3/stage-4 fixpoint, browse checks, standard-library tests, and game tests.
Terminal library tests and all six C callback tests pass separately. Baseline
and updated compilers produce byte-identical game, compiler, and terminal
executables. Local `l8` is refreshed; no promotion was performed.

New engine regressions cover two-edge and transitive three-edge contradictions
on either predecessor, preservation of the surviving state and its implications,
zero-weight cycles, conditional edges, older shared snapshots, and implicit
fixed-length edges. Existing independent graph-oracle, overflow/sentinel,
aliasing, and budget-fallback regressions also pass.

Temporary artifacts include `.build/instrument-budget-scale.py`,
`.build/instrument-cycle.py`, `.build/trace-late-search.py`, the
`.build/budget-game-{half,quarter}.{log,json}` traces, `.build/cycle-game.json`,
`.build/late-search-traces.json`, and `.build/late-zero-certificates.json`.
Native results and samples are in `.build/cycle-bench.json` from
`.build/bench-cycle.py`; hardware samples are in `.build/perf-cycle.json`.
Full validation is recorded in `.build/block-cycle-full-build-final.log`.
These scratch artifacts are not tracked.
