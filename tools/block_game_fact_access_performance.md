Block-game fact-access investigation (2026-09-28)

Baseline: promoted compiler `6988b9f`, saved locally as
`.build/block-round-baseline`. This round changes only verifier fact access,
not proof rules, budgets, graph layout, or generated-code optimizations.

What the profile showed

Five CPU-pinned sampling runs per event attributed about 9.4% of cycle samples
to graph search, 5.8% to fact storage, 3.9% to `bounds_row`, and 2.3% to
`bounds_numeric_ref`. Row access repeatedly checked the same state pointer,
storage pointer, snapshot count, and backing slice. Copy loops repeatedly
checked source and destination lengths. These are opportunities to remove
work even when the corresponding metadata already lives in L1.

Retired L1-miss samples instead highlighted `bounds_term_local_value` (14%),
`find_local`, and string comparison. Sampling percentages are approximate
self attribution, not inclusive function costs or predicted speedups.

Changes

- Prefix copying borrows source slices and validates all copy lengths once,
  then uses proved indexing. Same-capacity bucket copies also use proved
  indexing; dynamically traversed chain links remain checked.
- Direct evidence borrows numeric descriptors, buckets, links, and the
  snapshot count once, avoiding helper calls for each chain entry.
- Call-preservation and call-filtering loops borrow the contiguous row slice
  and validate the snapshot length before scanning.

Every reader still respects the immutable snapshot's count, even when a
sibling has appended to its storage. Call invalidation and conditional
separation checks are unchanged. No additional persistent cache or metadata
is introduced.

Measurements

Seven warm builds per compiler alternate order, pinned to logical CPU 2 of
the Intel Core i5-8365U. Instrumentation, tests, timing, and counter collection
run separately. Both compilers build identical source inputs.

| Root / phase | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game, total | 465.3 ms | 450.4 ms | 3.2% |
| Game bounds inference | 80.9 ms | 78.9 ms | 2.5% |
| Game bounds validation | 296.8 ms | 284.6 ms | 4.1% |
| Compiler, total | 243.1 ms | 241.1 ms | 0.8% |
| Terminal, total | 131.4 ms | 130.2 ms | 0.9% |

Compiler and terminal changes are small; do not treat them as substantial
improvements. Three separate RSS runs give medians of 292248 and 292120 KiB,
essentially unchanged. Generated game, compiler, and terminal binaries match
byte for byte between baseline and candidate.

Seven alternating hardware-counter runs per group, user space only, require
full event running coverage:

| Counter | Before | After | Change |
| --- | ---: | ---: | ---: |
| Cycles, overall group | 1.685 B | 1.640 B | -2.7% |
| Instructions | 4.140 B | 4.018 B | -2.9% |
| L1 data loads | 1.211 B | 1.169 B | -3.4% |
| L1 data stores | 673.1 M | 650.6 M | -3.3% |
| Branches | 522.4 M | 503.4 M | -3.6% |
| Branch misses | 3.542 M | 3.532 M | -0.3% |
| L1 data load misses | 21.319 M | 21.333 M | +0.1% |
| Retired loads missing L1 | 6.109 M | 6.248 M | +2.3% |
| Retired loads missing L2 | 1.468 M | 1.484 M | +1.1% |
| Retired loads missing L3 | 302807 | 285905 | -5.6% |
| Total stall cycles | 198.6 M | 197.8 M | -0.4% |
| L1-miss stall cycles | 59.7 M | 60.5 M | +1.3% |

The consistent instruction and load reduction supports the timing result.
This is less repeated work on cached data, not a demonstrated improvement
in cache-miss behavior. Retired-load events and all-load events measure
different populations and should not be combined into one miss rate.

Validation and reproduction

`./build.sh` passes: bootstrap, self-host fixpoint, formatting, compiler
fixtures, browse checks, standard library, game build, and game tests.
An additional engine regression checks that call filtering does not expose a
newer sibling row and removes an escaped local while preserving later rows.
Existing tests cover hash collisions, descriptor snapshot boundaries,
conditional evidence, pool reuse, and independent shortest-path comparisons.

Local timing samples and runner: `.build/round-bench.json` and
`.build/bench-round.py`. Hardware samples: `.build/round-perf.json`.
Sampling results: `.build/round-sample-functions.json`. These are temporary
build artifacts; the tables above preserve the relevant results.

```sh
python3 tools/bench_perf.py ./l8 --baseline .build/block-round-baseline \
  --root programs/block-game/block-game.l8 --cpu 2 --runs 7 \
  --group overall --group l1 --group retired-loads --group branches \
  --group stalls --output .build/round-perf.json
```

Further angles

Repeated AST walks to classify stable local terms remain an opportunity.
Memoization would need a clear invalidation rule for address-taking and
function effects; this round does not assume those fields are immutable.
Graph search remains the largest individual sampled function. Reducing live
facts or redundant projection work may offer larger gains than further
helper removal. Neither opportunity has been measured in this round.
