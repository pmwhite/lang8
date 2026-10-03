# Current assembly versus upstream implementations

Compared the optimized standalone assembly (`00e45b2`, binary SHA256
`ccf5d1d98c206bd906856b0034f5152437564aa101a2a16020c821e3efacd24d`) with
[lambada-llc/tree-calculus](https://github.com/lambada-llc/tree-calculus) at
`b873b56a3130cfac0427ebf2fd73f6162add4248`, the remote HEAD when measured.
That revision adds a change to a separate DAG canonicalizer; the official
mini-suite programs and evaluator roster are unchanged from our earlier scan.

On this Intel Core i5-8365U, the assembly leads the tested upstream configurations
in all five cases in the final run. The four substantial cases are **2.55–3.67×
faster** than the fastest upstream implementation for each workload. The tiny
size case is dominated by startup and has only a 0.16 ms margin.

| Workload | Our assembly | Fastest upstream | Upstream time | Speedup |
|---|---:|---|---:|---:|
| Size | 2.014 ms | ASM x64-ternary | 2.176 ms | 1.08× |
| Fibonacci, n=24 | 14.818 ms | C++ GCC graph | 54.331 ms | 3.67× |
| Exponentiation, n=16 | 14.897 ms | C++ Clang peek32 | 37.934 ms | 2.55× |
| Rules, n=200,000 | 24.103 ms | C++ Clang peek32 | 68.324 ms | 2.83× |
| Descending merge sort, n=2,000 | 25.090 ms | C++ GCC graph | 79.059 ms | 3.15× |

`graph` is `eager-graph-nil-mmap-32`; `peek32` is
`eager-ternary-nil-mmap-32-peek`. The fastest configuration changed between the
broad scan and final comparison on size and exponentiation, underscoring the
need to compare fresh runs rather than combine unrelated minima.

For reference, the unchanged L8/native evaluator took 1.585, 28.288, 31.156,
55.495 and 52.249 ms on those same cases. It was faster than our standalone on
the tiny size case. These are measurements on this host and suite, not a claim
that assembly wins every arbitrary program or CPU.

## Method and coverage

Read the program encodings and sizes from upstream `benchmark/run.sh` and use
our output-checking runner, `programs/tree-calculus/bench.py`. This executes the
same logical workloads and expected results, including minbin conversion where
required, but uses a rotating interleaved timing order rather than the upstream
shell timer. All implementations are pinned to logical CPU 2. Timings include
process startup, parsing and output; each table entry is best of seven samples.
The two-second timeout and unlimited process stack match upstream. All individual
samples and medians are retained in the JSON report.

The full scan covered **32 upstream evaluators in 51 configurations**:

- 19 C++ evaluators, each freshly built with GCC and Clang (38 configurations).
- All six assembly evaluators in the official mini-suite.
- Three JavaScript evaluators and three WebAssembly evaluators.
- Python.

The final comparison retained the top three upstream configurations from each
workload, plus all six assembly variants: 12 upstream configurations in total,
with our standalone and L8/native run alongside them. **Every final comparison
output passed.** The broader scan recorded 16 failed workload/configuration
pairs: 12 timeouts and four WebAssembly stack-overflow errors. They remain in
the report as failures, not successful timings.

Lean was not tested because `lake` is unavailable. The separate DAG server and
canonicalizer, parallel frontier reducer, Jay-rule assembly variant, and other
implementations outside `benchmark/run-one.sh` are not part of this comparison.

## Build details

GNU binutils 2.40 built our standalone and upstream assembly. JavaScript and
WebAssembly used Node 26.7.0; Python was 3.11.2. TypeScript output was rebuilt
from the current checkout using the already-installed build dependencies.

C++ used GCC 12.2 and Clang 14, `-O3 -std=c++20`, and libstdc++ rather than
upstream's Clang/libc++/C++23 setup. In a separate build copy, only the include
and registry entry for `LazyAppStream` were removed because this host's library
lacks `append_range`. That evaluator is already excluded from the official
suite; all timed evaluator sources were unchanged. The exact driver patch,
compiler versions, commands, source revision, and binary hashes are recorded.
These toolchain differences limit claims about other C++ builds.

[Raw results](results/upstream-current.json) include the full scan, final
comparison, failures, command lines, input checksums, binary sizes and source/
binary checksums. Historical L8 and assembly results remain in their original
reports; the table here comes entirely from this fresh comparison.
