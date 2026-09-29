Block-game endpoint investigation (2026-09-28)

The subsequent [budget-distribution investigation](bounds_search_budget_distribution.md)
classifies the remaining expensive searches and tests a tenfold larger budget.

This round reduces full game compilation from 553.2 to 507.3 ms (8.3%).
The baseline is commit `0b04807`, saved as `.build/block-builder-baseline`.
Both compilers build the same current source tree. Seven warm runs per
compiler alternate order and are pinned to logical CPU 2 of the Intel
Core i5-8365U. Timing, counter collection, and tests run separately.

| Root | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game | 553.2 ms | 507.3 ms | 8.3% |
| Compiler | 260.3 ms | 250.1 ms | 3.9% |
| Terminal | 152.8 ms | 138.0 ms | 9.7% |

Game bounds inference falls from 95.7 to 83.6 ms, and validation from 365.6 to
332.7 ms. Phase medians are independent and need not sum to the total median.

What the profiles showed

Five hardware cycle-sampling runs collected 5,135 samples. The two helpers
constructing left/right term records accounted for about 6.1% of self samples,
even though the previous round had already made their inputs borrowed.
Graph search accounted for 14.6%, and fact storage copying for 5.4%.
Retired L1 miss samples also highlighted AST path hashing. These are sampled
whole-build proportions, not exact inclusive function timings. A temporary
packer exported addresses for the otherwise unsymbolized compiler; its output
was checked byte-for-byte against the measured baseline.

The retained changes

1. Numeric descriptors embed two complete term references. Readers directly
   access or borrow endpoints instead of reconstructing them with helper calls.
   Validity lives in existing padding inside each 24-byte term. The complete
   descriptor occupies 64 bytes, versus 56 previously; both endpoint validity
   bits must pass before a numeric query is accepted.
2. Hashing, direct evidence, numeric entailment, and solver entry points borrow
   numeric descriptors. Hot endpoint comparisons borrow term references too.
   These calls do not retain pointers to temporary descriptors. Graph loading
   copies terms and explicitly records its source-state lifetime requirement.
3. Simple variable endpoints cache their Obj alongside their AST path.
   Hashing and identity comparison can avoid loading the AST again. The path
   remains available for known-length queries and AST export; member paths
   retain their existing structural comparisons.
4. Graph search holds local references to its adjacency and head arrays,
   avoiding repeated graph-field loads in the relaxation loop. Search order,
   budgets, sentinel handling, and proof rules are unchanged.

Hardware results

Seven alternating runs per group used user-space events on CPU 2. Every
counter reported full running coverage. Counts include the whole build.

| Event | Before | After | Change |
| --- | ---: | ---: | ---: |
| `cycles` | 2,008,608,700 | 1,836,050,755 | -8.6% |
| `instructions` | 5,101,605,049 | 4,606,997,139 | -9.7% |
| `L1-dcache-loads` | 1,505,341,824 | 1,341,360,408 | -10.9% |
| `L1-dcache-stores` | 866,957,826 | 720,083,267 | -16.9% |
| `L1-dcache-load-misses` | 22,882,432 | 21,460,363 | -6.2% |
| `mem_load_retired.l1_miss` | 6,662,030 | 6,131,340 | -8.0% |
| `mem_load_retired.l2_miss` | 1,608,520 | 1,454,664 | -9.6% |
| `mem_load_retired.l3_miss` | 281,749 | 295,324 | +4.8% |
| `branch-misses` | 3,723,018 | 3,632,741 | -2.4% |
| `cycle_activity.stalls_total` | 209,781,241 | 206,778,152 | -1.4% |
| `cycle_activity.stalls_l3_miss` | 45,252,139 | 46,183,632 | +2.1% |

The main benefit is less executed work and fewer memory accesses. Lower L1
and L2 miss counts accompany the reduced traffic, but total measured stalls
only fall 1.4%. Retired L3 misses rise 4.8%; this is not an across-the-board
cache-locality improvement. Generic cache-miss events and retired-load misses
measure different activity and should not be substituted for one another.

The larger descriptor raises peak RSS from 281856 to 292348 KiB: 275.3 to
285.5 MiB, an increase of 10.2 MiB (3.7%). These are medians of three separate
runs. The throughput gain comes with that explicit memory tradeoff. The
64-byte size is a stride, not a guarantee that each descriptor is cache-line
aligned.

Rejected experiments and remaining angles

- Filters make roughly 440,000 intermediate state wrappers per game build.
  Reusing one private wrapper for surviving prefixes did not improve native
  timing, so that prototype was removed. Instrumentation overhead makes the
  inclusive filter times look more expensive than the uninstrumented profile.
- An initial embedded-endpoint layout occupied 72 bytes. It offered no clear
  advantage over 64 bytes in alternating trials and used more memory. Moving
  validity into term padding retained direct access with a smaller footprint.
- Temporary search instrumentation counted 6,658,833 edge visits, including
  2,581,184 in searches that exhausted their budget. Negative-cycle handling
  remains an angle worth investigating. Simply stopping those searches sooner
  could lose proofs, so no budget or proof-strength changes were made.
- Branch fact-table copying and generated aggregate-call overhead remain
  possible targets. The wrapper experiment did not test chunked persistent
  storage, and this round does not add backend inlining or register allocation.

Validation and reproduction

The full `./build.sh` passed, including bootstrap-compatible fixtures, compiler
fixtures, formatting, stage-3/stage-4 fixpoint, browse checks, standard-library
and game tests. Terminal library tests and six C callback tests passed
separately. The game, compiler, and terminal executables were each byte-identical
when built by the baseline and updated compilers. New engine checks cover the
64-byte layout, cached/path-only/object-only identity agreement, hash collisions,
graph interning, invalid left or right endpoints, and constant normalization.
The existing independent graph oracle and alias/snapshot regressions also pass.
Local `l8` is refreshed; `src1` and the saved bootstrap are unchanged.

```sh
python3 tools/bench_perf.py .build/block-term-stage3 \
  --baseline .build/block-builder-baseline \
  --root programs/block-game/block-game.l8 --cpu 2 --runs 7 \
  --group overall --group l1 --group retired-loads --group branches --group stalls \
  --output .build/perf-term.json
```

Temporary artifacts: `.build/bench-term.py`, `.build/term-bench.json` (timing
and RSS samples), `.build/perf-term.json`, `.build/current-sample-functions.json`,
and `.build/block-term-full-build.log`. These artifacts are not tracked.
