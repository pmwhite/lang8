Block-game follow-up investigation (2026-09-28)

This round finds a further 9.1% improvement, smaller than the preceding 24%
round. Seven interleaved warm full builds per compiler give:

| Root | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Block game | 603.2 ms | 548.1 ms | 9.1% |
| Compiler (`src2/main.l8`) | 267.0 ms | 257.6 ms | 3.5% |
| Terminal | 166.8 ms | 148.8 ms | 10.8% |

The baseline is the promoted compiler at commit `48535dd`, saved as
`.build/block-next-baseline`. Both compilers build the same current source tree.
Block-game bounds inference fell from 105.9 to 94.1 ms, and validation from
406.9 to 365.3 ms. Peak RSS medians from three separate runs were 289808 and
282276 KiB (283.0 to 275.7 MiB, down 2.6%). Phase medians are independent and
need not add to the median total.

What changed

1. Same-size fact-table copies reuse existing hash chains. Links always point
   backward, so copying the prefix links and trimming bucket heads past the
   snapshot count reconstructs exactly the prefix index. A different bucket
   count still requires rehashing. This avoids repeatedly hashing AST terms.
2. Fact filtering and joins reuse normalized numeric descriptors already stored
   with the source rows. They no longer decode unchanged facts from AST syntax
   again. Remaining term-view accessors borrow their inputs.
3. Join projection performs redundancy tests using normalized term references.
   AST expressions are created only for a projected relation that is actually
   added. The selected terms, search budget, and projection limit are unchanged.
4. A missing length endpoint can sometimes be translated to zero plus its
   implicit bound, using an existing cached graph. This stores no query-owned
   AST pointers. The optimization requires small graph weights and offsets so
   translated paths stay far from the distance sentinel. Incomplete searches
   are used only if they already prove the query; other cases retain the
   query-local fallback. Tests include large weights that would otherwise
   cross the sentinel differently after translation.
5. Generated code omits unused length loads and stack saves for proved indexing.
   Explicit checked indexing retains its checks. Built-in slice/string `len`
   evaluates its argument once and directly loads the length header instead of
   calling the two-instruction runtime helper. These backend improvements also
   apply to compiled programs, not just the self-hosted compiler.

The final game executable is about 8 KiB smaller. Unlike verifier-only rounds,
byte-identical output is not expected because machine-code generation changed.
The saved bootstrap and `src1` have not been changed this round.

Hardware measurements

The existing `tools/bench_perf.py` runner warmed each compiler, alternated their
order over seven runs per group, and pinned user-space measurements to logical
CPU 2 of the Intel Core i5-8365U. Every counter reported full running coverage.
Counter collection was separate from timing, tests, and peak-memory collection.
Counts cover the whole build; they are not verifier-only counters.

| Hardware event (`:u`) | Before | After | Change |
| --- | ---: | ---: | ---: |
| `cycles` | 2,227,051,230 | 2,007,090,963 | -9.9% |
| `instructions` | 5,574,957,770 | 5,101,604,921 | -8.5% |
| `L1-dcache-loads` | 1,639,175,613 | 1,505,433,064 | -8.2% |
| `L1-dcache-stores` | 1,006,409,484 | 866,957,823 | -13.9% |
| `L1-dcache-load-misses` | 24,287,901 | 22,754,736 | -6.3% |
| `mem_load_retired.l2_miss` | 2,123,286 | 1,614,755 | -24.0% |
| `mem_load_retired.l3_miss` | 287,549 | 277,326 | -3.6% |
| `branch-misses` | 3,831,029 | 3,691,677 | -3.6% |
| `cycle_activity.stalls_total` | 240,247,517 | 209,719,979 | -12.7% |

Cycle reductions across the event groups ranged from 9.9% to 11.7%. Fewer
instructions and stores, plus fewer L2 read misses, support the native timing
improvement. Retired L3 read misses fell only 3.6%. These measurements do not
support treating main-memory read latency as the primary remaining problem.
Generic cache events and retired-load events count different activity; their
counts should not be substituted for each other.

Investigation results and larger opportunities

Temporary instrumentation of the baseline counted about 11,080 joins, 2,164
projections, 44,912 graph searches, and 158,300 generic fact-membership checks.
Instrumentation adds substantial overhead; its inclusive timings overlap and
were used only to choose candidates. Common-prefix discovery took about 6 ms
in that instrumented build, so deeper ancestor tracking was not pursued.

A four-entry graph-cache prototype measured 541.5 ms against 542.4 ms for its
two-entry comparison compiler. That difference did not justify increasing the
cache and was discarded. The earlier contiguous-adjacency packing experiment
also did not help. The retained changes remove work rather than increasing
cache capacity.

The largest loaded baseline state had 432 facts: 270 numeric differences,
85 freshness facts, 75 inequalities, and two equalities. Its graph had only
139 nodes and 375 edges. This suggests the following larger investigations:

- Reduce live proof state. Determine which facts are needed by later statements
  and preserve consequences between live terms before dropping dead ones.
  Separating invariant resource facts from frequently changing loop facts could
  reduce work across filtering, copying, joins, and searches at once. This
  requires dependency/liveness analysis; indiscriminate fact removal would lose
  useful proofs.
- Share more branch storage. Prefix sharing still copies a large table after a
  change in its middle. Chunked persistent tables or a shared immutable base
  plus small branch deltas could reduce copying and write traffic. Extra lookup
  indirection could hurt common small states, so this needs a measured prototype.
- Reuse proofs across small state changes. The graph-cache key identifies the
  entire exact snapshot. A proof that records its supporting facts might survive
  unrelated assignments or calls. The hard part is sound invalidation across
  aliasing, field writes, and branch joins; increasing cache capacity alone does
  not solve this.
- Improve generated compiler code more broadly. This build still retires about
  5.1 billion instructions. The small `len`/indexing changes show that backend
  quality affects verifier speed too. Small-function inlining, elimination of
  aggregate copies, and better retention of values in registers are candidates.
  Their compile-time cost and effects on argument evaluation must be measured.

These are hypotheses for future work, not additional measured savings. The
first two target the large-state structure specific to this game; the last two
could improve other compiler workloads as well.

Validation and reproduction

The full `./build.sh` passed: bootstrap-compatible fixtures, self-hosted compiler
fixtures, formatting checks, stage-3/stage-4 fixpoint, browse checks, standard
library tests, game build, and game tests. Terminal library tests and six C
callback tests passed separately.

Engine regressions cover same-bucket collisions across copied snapshots and
compare missing-length queries with explicit query-local graphs, including
large-offset and sentinel-crossing cases. The new code-generation fixture
checks argument evaluation counts for `len`, empty strings/slices, simple and
complex proved indexing, fixed arrays, and an explicit out-of-bounds exception.
That fixture and the existing checked-access fixture also passed through GNU
assembly plus the L8 ELF packer. The L8 textual assembler rejects the new fixture
with `unknown instruction` under both the baseline and current compiler; this
preexisting textual-assembler limitation was not changed. Direct builds pass.

```sh
python3 tools/bench_bounds.py ./l8 --baseline .build/block-next-baseline \
  --build --runs 7 --root programs/block-game/block-game.l8
python3 tools/bench_perf.py ./l8 --baseline .build/block-next-baseline \
  --root programs/block-game/block-game.l8 --cpu 2 --runs 7 \
  --group overall --group l1 --group retired-loads --group branches --group stalls \
  --output .build/perf-next.json
```

Exact interleaved timings and individual samples are in
`.build/block-benchmark-next*.json`, generated by `.build/bench-next.py`.
Hardware samples are in `.build/perf-next.json`, memory samples in
`.build/next-memory.json`, and full build logs in `.build/next-full-build-final.log`.
All `.build` artifacts are temporary.
