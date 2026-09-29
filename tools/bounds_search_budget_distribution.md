Bounds-search budget distribution (2026-09-28)

The [subsequent investigation](block_game_negative_cycle_performance.md) traces
the cutoff-dependent thresholds and implements early contradiction detection.

Measured compiler source: `5beb308`. Temporary instrumented copies recorded every
search, its initial budget, edge visits, exit reason, caller category, inference
versus validation phase, and final distances. Production compiler code was not
changed. These are work counts, not timings of the instrumented compiler.

Game distribution

The full block-game build executes 42,682 graph searches:

| Outcome | Searches | Work used |
| --- | ---: | --- |
| Queue drained; complete distances | 39,108 | At most 2.00% of budget |
| Requested bound proved early, ordinary cases | 3,380 | Less than 2% of budget |
| Requested bound proved early, late cases | 16 | 99.34–99.80% of budget |
| Budget exhausted | 178 | 100% of budget |

There are no searches between 2% and 99% of their budget. The 178 exhausted
searches are 0.417% of all searches, but account for 2,581,184 of 6,658,833 edge
visits (38.76%). No search reaches the absolute 262,144-visit cap: exhausted
searches have graph-dependent limits between 1,152 and 34,240 visits.

For searches that drain their queues, the median is 11 visits, p90 is 318, p99
is 342, and the maximum is 556. Quantiles use the sorted observation at
ceil(p * (count - 1)). The largest budget fraction among these searches is
55 / 2,752 = 1.9985%; largest absolute work and largest fraction are different
searches. Successful early exits have median 5 visits; the 16 late cases take
28,913–30,919 visits.

What causes the expensive cases

Every exhausted search, and every late success, has a reachable negative cycle.
This was checked independently by exporting the graph and running Bellman–Ford
with Python integer arithmetic. Each diagnosis includes an explicit predecessor
cycle whose weights sum to a negative number. Reachability starts at the actual
source, or all length nodes for a multi-source query.

A negative cycle means the stored inequalities are inconsistent. It does not
mean that the requested conclusion is false. For example, a recorded game-main
state contains both `move_sel <= -1` and `move_sel >= 0`. Repeatedly walking that
cycle manufactures successively tighter bounds under impossible premises.

These states can arise while analyzing an impossible branch during an early
loop-analysis iteration. A simple source example is `slurp_path` in
`programs/block-game/level.l8`: initially n=0 and cap=65536, but the body of
`if (n + 4096 >= cap)` is still analyzed, temporarily combining n<=0 with
n>=61440. Later loop iterations can reach that branch; the contradiction is
specific to the current incoming facts, not a claim that the source branch is
always dead. Similarly, sentinel variables initialized to -1 appear in
short-circuit conditions that also analyze the nonnegative alternative.

The exhausted searches occur in:

| Function | Exhausted searches |
| --- | ---: |
| `main` | 74 |
| `load_grid_src` | 48 |
| `parse_level_src` | 16 |
| `closest_visited_finish` | 16 |
| `room_at` | 14 |
| `slurp_path` | 10 |

Of the 178, 176 are all-distance searches for branch-join projection, one is
a join's redundancy check, and one is a length-relative overflow check. All
16 late successes are join redundancy checks in `main`.

The late thresholds are themselves derived from partial, budget-limited
searches on contradictory predecessor states. Subsequent redundancy checks
then spend almost the same work rediscovering those bounds. They are not
examples of ordinary consistent graphs barely reaching convergence.

Are useful proofs already being lost?

The answer is narrower than "no proofs are lost":

- For every exported expensive graph, the independent solver identified all
  vertices downstream of reachable negative cycles. For every other reachable
  vertex, its finite shortest-path distance was already present in the original
  search's result. No finite shortest-path bound was missed in these cases.
- One fixed join redundancy query really does miss a proof at the current
  cutoff: it asks for a bound of 8,701 and has only reached 8,705 after 32,832
  visits. Replaying exactly that graph and query reaches 8,701 at visit 33,879,
  another 1,047 visits (3.19%). Its target is downstream of a negative cycle,
  so this is a tighter consequence of inconsistent premises, not a missed
  finite shortest-path solution. Failing this redundancy check causes the
  proposed projected fact to be inserted instead of skipped.
- The other exhausted early query has an unreachable target. Ten times more
  work still finds no path; unrelated negative cycles keep its queue busy.
- Increasing every search budget tenfold for the full game build leaves all
  2,538 array-access classifications identical: 1,181 proved unchecked accesses
  and 1,357 checked accesses still requiring checks. The executable is
  byte-identical to both the normal-budget probe and production compiler output.
  Counts of completed, early, and exhausted searches are also unchanged.
- The tenfold budget raises total edge visits from 6,658,833 to 34,208,377.
  Some internal numeric bounds change: cycle-derived projection thresholds
  become stronger too, keeping those later redundancy checks near their new
  cutoff. Thus this experiment does not establish that every internal proof
  result is identical.

The replay implementation exactly reproduces the original exit reason, visit
count, and every node's distance for all 194 expensive baseline searches before
trying the larger fixed-query budget. This checks the graph export and replay
against the compiler rather than relying only on aggregate counts.

This is reassuring evidence for this workload, not a general completeness
claim. A bounded search can miss a proof on other graphs. It also does not
justify arbitrarily lowering the budget: budget-derived facts can flow through
joins and affect later queries. The promising change is sound recognition of
contradictory states, with explicit handling of unreachable predecessors.

Cross-checks on other roots

| Root | Complete | Early success | Exhausted | Late successes (>2%) |
| --- | ---: | ---: | ---: | ---: |
| Compiler (`src2/main.l8`) | 18,362 | 2,093 | 120 | 12 |
| Terminal | 18,428 | 1,137 | 16 | 0 |

All these additional exhausted/late graphs also contain reachable negative
cycles, and none miss finite distances to vertices unaffected by those cycles.
The tenfold-budget whole-build comparison above was performed for the game.

Artifacts and reproduction

Temporary scripts `.build/instrument-budget.py`, `.build/analyze-budget.py`, and
`.build/replay-budget.py` create the instrumented source copies, classify the
traces and negative cycles, and replay the expensive game searches. Graph dumps
include all adjacency edges, term labels, length seeds, and final distances.

```sh
python3 .build/instrument-budget.py 1
./l8 build .build/budget-probe-1-src/main.l8 -o .build/budget-probe-1
.build/budget-probe-1 build programs/block-game/block-game.l8 \
  -o .build/budget-game-1 2> .build/budget-game-1.log
python3 .build/analyze-budget.py .build/budget-game-1.log
python3 .build/replay-budget.py
```

Repeat instrumentation/build/analysis with factor `10` for the larger budget.
The `.build/budget-game-{1,10}.json` files retain search records, oracle results,
and access classifications; `.build/budget-replay.json` records the replay
checks. Compiler and terminal traces use `.build/budget-compiler.*` and
`.build/budget-terminal.*`. These scratch artifacts are not tracked.
