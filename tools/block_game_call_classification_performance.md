Block-game call-classification investigation (2026-09-28)

Baseline: `71698ff`, saved as `.build/block-classify-baseline`.

Fresh sampling after the fact-access changes still attributed 13.1% of
retired L1-miss samples to `bounds_term_local_value`. During call filtering,
the verifier repeatedly walks variable expressions and `len(variable)` calls
to recover the same object identity. Numeric descriptors already contain
that identity. Reading it directly avoids the expression tag dispatch and,
for lengths, the function-name comparison and recursive argument visit.

The change

Both call filtering and its pure-call fast path borrow the numeric descriptor
for each difference row. When an endpoint has a cached object, classification
reads that object's current `is_local` and `bounds_addr_taken` flags. Otherwise
it uses the existing AST classifier. Equality rows, member paths, dereferences,
and effect/separation handling retain their existing behavior.

No new cache or stored stability flag is introduced. This distinction matters:
object identity is already part of the numeric representation, but escape
flags must still be observed at the time of the call. Regressions explicitly
change escape/local flags after a fact has been stored, then check that call
filtering reflects the new values. Length facts receive the same test.

Native measurements

Warm builds alternate order and run on logical CPU 2 of the Intel Core
i5-8365U. Timing, profiling, tests, and hardware-counter collection run
separately. Both compilers consume identical sources.

The initial seven-pair comparison measured 460.3 to 450.6 ms (2.1%). A longer
fifteen-pair confirmation measured **466.0 to 462.0 ms (0.9%)**. Bounds
validation in that confirmation fell from 297.1 to 293.0 ms. Treat this as a
roughly 1% improvement, not a repeatable 2% gain. Host timing varies between
runs; comparisons are within each alternating run set.

The initial compiler and terminal comparisons measured 240.4 to 239.3 ms and
133.9 to 132.6 ms respectively. Those small differences are not strong evidence
of gains on either workload. Initial three-run peak RSS medians were 292588
and 292636 KiB, effectively unchanged.
The confirmation's separate three-run RSS medians were 292036 and 293212 KiB
(+0.4%); there is no new persistent allocation in this change.

Hardware counters

Seven alternating user-space runs per group, pinned to CPU 2, with full event
running coverage:

| Counter | Before | After | Change |
| --- | ---: | ---: | ---: |
| Cycles, overall group | 1.636 B | 1.614 B | -1.3% |
| Instructions | 4.018 B | 3.969 B | -1.2% |
| L1 data loads | 1.169 B | 1.154 B | -1.3% |
| L1 data stores | 650.6 M | 644.9 M | -0.9% |
| L1 data load misses | 21.370 M | 20.890 M | -2.2% |
| Retired loads missing L1 | 6.088 M | 5.790 M | -4.9% |
| Retired loads missing L2 | 1.463 M | 1.327 M | -9.3% |
| Retired loads missing L3 | 289917 | 286709 | -1.1% |
| Branches | 503.4 M | 495.8 M | -1.5% |
| Branch misses | 3.529 M | 3.508 M | -0.6% |
| Total stall cycles | 195.0 M | 192.5 M | -1.3% |
| L1-miss stall cycles | 58.6 M | 58.1 M | -0.8% |

Unlike the preceding round, this change measurably reduces retired loads
missing the nearer caches. The small cycle and stall improvements also show
why that does not translate into a similarly large whole-build speedup.
Retired-load events and all-load events count different populations.

Rejected experiments

- Borrowing descriptors when interning graph endpoints instead of passing
  them by value: the combined prototype measured 454.3 to 466.4 ms against
  baseline. Removed; no claim is made about the precise cause of regression.
- Returning immediately for a normalized integer-literal endpoint: the
  combined prototype measured 465.9 to 465.2 ms, with no convincing gain.
  Removed. Literal endpoints retain the original classifier.

Validation and reproduction

The full `./build.sh` passes, including bootstrap, self-host fixpoint,
formatting, compiler fixtures, browse checks, standard library, game build,
and game tests. Added engine regressions cover mutable escape/local flags
after descriptor creation and length-fact invalidation. Game, compiler, and
terminal outputs match byte for byte against baseline.

Local artifacts (removed by cleaning `.build`):

- `.build/classify-sample-functions.json`: fresh sampled profile.
- `.build/classify-bench.json`: initial three-root timing comparison.
- `.build/classify-final-bench.json`: fifteen-pair game confirmation.
- `.build/bench-classify-final.py`: confirmation runner.
- `.build/classify-perf.json`: all hardware-counter samples.
- `.build/block-classify-stage3`: measured candidate, identical to local `l8`
  after the full build.

```sh
python3 tools/bench_perf.py ./l8 --baseline .build/block-classify-baseline \
  --root programs/block-game/block-game.l8 --cpu 2 --runs 7 \
  --group overall --group l1 --group retired-loads --group branches \
  --group stalls --output .build/classify-perf.json
```
