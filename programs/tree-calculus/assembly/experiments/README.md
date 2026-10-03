# Assembly experiments, second round

Tested **35 variants** against the optimized standalone at `4cd70d7`, including
combinations and parameter sweeps. Kept two atomic changes: CRC32C memo hashing
(`682e598`) and direct leaf-ID checks (`98bd477`). Everything else remains an
experimental patch, not part of the production build.

## Final result

A fresh, interleaved comparison on the same i5-8365U, pinned to CPU 2:

| Workload | Before this round | Selected version | Wall-time reduction | L8/native | Speedup over L8/native |
|---|---:|---:|---:|---:|---:|
| Size | 1.909 ms | 1.761 ms | 7.8% | 1.486 ms | 0.84× |
| Fibonacci | 16.383 ms | 13.134 ms | 19.8% | 25.379 ms | 1.93× |
| Exponentiation | 16.518 ms | 13.393 ms | 18.9% | 27.810 ms | 2.08× |
| Rules | 27.204 ms | 21.621 ms | 20.5% | 48.551 ms | 2.25× |
| Merge sort | 27.327 ms | 23.096 ms | 15.5% | 47.115 ms | 2.04× |

Best of seven process wall times, including startup and I/O. The size case
varied in both directions across rounds and is too short for a confident gain
claim. The other four improved in every screening/revalidation round. Medians
and all individual samples are recorded, not just the minima.

| Workload | Cycles | Instructions | Branches | Branch misses |
|---|---:|---:|---:|---:|
| Fibonacci | -22.0% | -3.4% | -1.3% | -0.8% |
| Exponentiation | -22.2% | -3.1% | -0.4% | -7.5% |
| Rules | -24.6% | -2.0% | approximately unchanged | +2.4% |
| Merge sort | -15.2% | -2.6% | +0.7% | +2.5% |

Counters are medians of three separate user-mode samples. Code shrank from
1,951 to 1,918 bytes; ELF file size remained 8,712 bytes. This is not a comparison
against third-party evaluators. The default L8/native implementation was unchanged.
The selected assembly now requires **SSE4.2**, but does not require AVX2 or BMI2.

[Final raw comparison](../results/tricks-overall.json),
[CRC-only comparison](../results/06-crc-memo.json),
[leaf-ID comparison](../results/07-leaf-id.json).

## What survived and what did not

Screening used nine wall-time samples per workload and three separate hardware
counter samples, with one warmup invocation and a fixed-seed shuffled order.
Every invocation checked the expected output. Percentages below describe the
screening rounds, not the final comparison above. Small differences without
repeatable support were not retained.

| Experiment | Observation and decision |
|---|---|
| CRC32C for memo hashing | Consistent gain; keep. Both lookup and insertion use the same ordered pair and exact-key checks. |
| CRC32C for node hashing, or both caches | No broad gain; keep the existing constructor hash. |
| Saved memo slot in continuation | Helped alone, but lost against the selected CRC + leaf combination; reject. |
| BMI2 PDEP to reconstruct packed keys | Reduced unpacking instructions but still slower than the selected combination; reject. |
| Direct leaf-ID tests | Avoid dependent child loads without representation changes; keep. |
| Tagged IDs with precomputed reduction categories | Construction and masking costs; roughly 3–13% slower median times on substantial cases; reject. |
| Four-way AVX2 memo buckets | Same total number of entries, SIMD key comparisons and round-robin replacement. Roughly 9–10% slower on rules/sort; reject. CRC hashing reduced the loss but did not beat scalar CRC lookup. |
| Eager child loads and software prefetch | No convincing broad improvement; reject. |
| Cache-line alignment | No repeatable gain and regressions on some cases; reject. |
| Move stack bounds checks to memo/scheduling paths | Small initial gains disappeared with the selected combination; reject. |
| Always probe memo cache | Sorting improved about 8%, but rules slowed about 17% and exponentiation about 10%; reject. |
| Cold-lookup sampling every 4 or 64 misses instead of 16 | No broad gain; reject. |
| Explicit huge-page advice | No gain. Transparent huge pages were already configured `always`; disabling them hurt. No system settings were changed. |
| Smaller/larger constructor and memo caches | Tradeoffs or broad regressions. A 16K-entry memo cache hurt sorting; a 256K-entry memo cache hurt all substantial cases. Keep 16K constructor / 64K memo. |
| Seed CRC with the first ID instead of packing the pair | Worse behavior on this suite; reject. |
| Loop-entry alignment to 16/32/64 bytes | Highly sensitive to final code layout; padding the selected binary made it substantially slower. Reject. |
| Assembler branch-boundary padding | Similar to the selected unpadded binary, without a convincing additional gain. Reject the extra build flags. |

Full patches and binary checksums are in [manifest.json](manifest.json). Screens
[1](../results/tricks/screen1.json), [2](../results/tricks/screen2.json),
[3](../results/tricks/screen3.json), [4](../results/tricks/screen4.json) and
[5](../results/tricks/screen5.json) preserve the rejected results too. The first
three rounds compare against `base`; the last two compare against `crc-leaf`.
Do not compare absolute times across separate rounds as if they were interleaved.

## Why code layout mattered

A separate five-sample counter experiment on rules measured:

| Binary | Cycles | Uops from decoded-instruction cache | Uops from legacy decoder |
|---|---:|---:|---:|
| Starting version | 95.2 million | 111.3 million | 111.5 million |
| Selected version | 74.3 million | 231.3 million | 0.38 million |
| Selected version with 16-byte loop alignment | 103.5 million | 37.5 million | 178.0 million |
| Selected version with branch-boundary padding | 74.5 million | 228.6 million | 0.40 million |

The selected binary's measured uops overwhelmingly came from the decoded-
instruction cache. Almost unchanged retired instruction counts do not imply
unchanged execution cost. These measurements implicate front-end behavior;
they do not isolate one specific microarchitectural cause or prove that the
same layout will be best on another CPU. Keep remeasuring after code changes.

[Raw front-end counters](../results/tricks/frontend.json).

## Validation beyond the selection suite

Both retained changes passed the 720 extended oracle checks, 18 standalone
CLI/I/O checks, and the full repository build hook. The final binary also ran
seven additional workload variants, with expected answers checked every time:
Fibonacci 26, exponentiation 17, rules 500,000, descending sort 4,000, and random,
ascending and duplicate-heavy sorts of 2,000 elements. Median wall times improved
11–23% over the starting binary. These variants were checked after selection,
not used to tune parameters. [All samples](../results/tricks/holdout.json).

The experimental tagged representation and BMI2 version also passed the full
738-check standalone suite before screening. Rejected variants otherwise only
have the benchmark-output checks; they are experimental code, not supported
alternate implementations.

## Reproduce

Run from the repository root. GNU `as`/`ld` 2.40 reproduce the recorded binary
hashes; `patch`, Python 3 and working user-mode `perf` counters are also needed.
Some rejected variants require AVX2 or BMI2. Screening pins CPU 2; adjust the
scripts if that CPU is not available on the test host.

```sh
python3 programs/tree-calculus/assembly/experiments/replay.py --check-hashes
export TREE_CALCULUS_UPSTREAM=/path/to/lambada-llc/tree-calculus
python3 programs/tree-calculus/assembly/experiments/screen.py replay.json base crc-memo crc-leaf
HOLDOUT=1 RUNS=7 python3 programs/tree-calculus/assembly/experiments/screen.py holdout-replay.json base crc-memo crc-leaf
python3 programs/tree-calculus/assembly/experiments/frontend.py
```

`replay.py` reconstructs each source from `4cd70d7` and its patch into
`.build/tree-calculus-tricks/NAME/`; it does not alter production sources.
Supply variant names to build a subset. Use `--output` and `TREE_TRICKS_BUILD`
together to choose a different build directory. Omit `--check-hashes` when
using a different binutils version. The manifest records special assembler
flags for the two branch-padding variants.
