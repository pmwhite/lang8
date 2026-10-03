# Standalone assembly optimization

Latest: the [prefetch and continuation experiments](experiments-continuations/README.md)
retained a continuation shortcut with controlled branch placement, cutting another
3–8% from substantial-workload wall times. The earlier
[35-variant round](experiments/README.md) retained CRC32C hashing and leaf-ID checks.
The combined table below records the initial five-step round; steps 06–08 and
the linked reports document later binaries.

Baseline is the standalone executable from commit `6a63ddf`, not the pure L8
reference loop. Changes are measured on the same five upstream workloads, pinned
to CPU 2 on Intel Core i5-8365U. Each report includes seven interleaved wall-time
samples and three separate samples of user-mode cycles, instructions, branches
and branch misses; all outputs are checked. File and executable-segment sizes,
source checksums and binary checksums are recorded. Small startup differences
are noisy; the substantial workloads are the useful timing signal.

`compare.py --baseline /path/to/saved-assembly --output results/NAME.json` adds an
earlier standalone executable to the comparison with L8/native and L8/reference.
The baseline can be built in a separate worktree at the corresponding commit.
The compiler and upstream source revisions are recorded in each report.

## Combined result

Fresh comparison of the final binary (`fe3b369`) with the original standalone
(`6a63ddf`) and the unchanged L8/native evaluator, using the method above:

| Workload | Original assembly | Optimized assembly | L8/native | Speedup vs original | Speedup vs L8/native |
|---|---:|---:|---:|---:|---:|
| Size | 1.544 ms | 1.827 ms | 1.381 ms | 0.85× | 0.76× |
| Fibonacci | 23.932 ms | 17.924 ms | 25.601 ms | 1.34× | 1.43× |
| Exponentiation | 25.647 ms | 16.507 ms | 28.663 ms | 1.55× | 1.74× |
| Reduction rules | 44.508 ms | 27.875 ms | 49.025 ms | 1.60× | 1.76× |
| Merge sort | 40.110 ms | 26.371 ms | 47.081 ms | 1.52× | 1.79× |

These are best-of-seven process times, including startup and I/O. Median times
are also in the report and show the same direction. Substantial workloads use
25–37% less wall time than the original standalone and 30–44% less than L8/native.
The tiny size case is 0.283 ms slower than the original standalone. No claim is
made that this wins every workload or beats all third-party evaluators.

| Workload | Cycles vs original | Instructions | Branches | Branch misses |
|---|---:|---:|---:|---:|
| Fibonacci | -33.4% | -37.3% | -12.9% | -7.4% |
| Exponentiation | -39.8% | -37.1% | -12.8% | -27.5% |
| Reduction rules | -41.3% | -37.3% | -12.6% | -36.8% |
| Merge sort | -36.5% | -38.6% | -17.5% | -13.7% |

Counters are medians of three separate user-mode runs. Executable code shrank
from 2,645 to 1,951 bytes (26.2%); ELF file size remains 8,712 bytes due to section
alignment. All five atomic implementation commits passed the repository build
hook and the 720 oracle plus 18 standalone checks. The final binary also passed
an explicit full-capacity arena-exhaustion check.

[Combined raw measurements](results/overall.json). Per-change results below use
separate runs; their percentages should not be multiplied to reconstruct this
comparison. Neither the L8 compiler nor its native kernel was changed.

## 01: direct addressing and 32-bit child loads

A cycles profile of a larger rules workload placed 73% in the reducer, 15% in
the constructor and roughly 12% in arena/frame allocation and copying. The
standalone now owns `kernel.s`, allowing optimization independently of L8's
native interface. Packed child IDs are read directly with scaled addressing;
leaf/constant paths skip unused child loads. Constructors store new nodes with
scaled addresses, and continuation addresses use LEA rather than multiplication.
The node representation, cache policy and reduction order are unchanged.

Against the original standalone, the seven-run comparison reduced wall time by
7.9% on Fibonacci, 7.4% on exponentiation, 7.0% on rules and 7.4% on sorting.
Retired instructions fell 17.8–20.3% on those cases. Cycle changes ranged from
-3.1% to -11.0%. Executable code shrank from 2,645 to 2,576 bytes; ELF file size
remained 8,712 bytes because of section alignment. Branch counts are unchanged.

[Raw measurements](results/01-addressing.json). All 720 extended oracle checks
and 18 standalone CLI/I/O checks passed. This is a specialization of the original
algorithm, not benchmark recognition or precomputed answers.

## 02: packed continuations

Continuation frames now occupy one 64-bit word instead of three. Two tag bits
encode the operation; the remaining bits contain both node IDs. The parser and
printer share this smaller stack. Evaluation enters with an empty stack, so it
also avoids maintaining a generic caller's stack base.

Against step 01, exponentiation wall time fell 8.6% and rules fell 9.6%.
Fibonacci and sorting were 0.9% and 0.7% slower in this run, respectively;
there is no clear wall-time improvement on those two. Their cycle counts fell
2.0% and 1.7%. Instructions fell 5.5–5.7% across the four substantial cases,
with effectively unchanged branch counts. Frame storage and copying are one
third of their former size. Code shrank from 2,576 to 2,457 bytes; the ELF
remains 8,712 bytes.

[Raw measurements](results/02-frames.json). All 720 extended oracle checks and
18 standalone CLI/I/O checks passed.

## 03: let anonymous memory supply zeros

The bump allocator never reuses storage, and anonymous mmap supplies zeros.
Explicitly clearing each new array was redundant. Removing it also lets the
allocation helper use a private register contract: malloc preserves the logical
length in rdx, without save/restore sequences or a stack-alignment requirement.

Against step 02, wall time fell 9.5% on Fibonacci, 7.0% on exponentiation,
2.5% on rules and 4.4% on sorting. User-mode cycles fell 4.7%, 5.0%, 1.8% and
0.6%, respectively. Retired instructions and branches barely change: repeated
string instructions obscure the amount of memory work, and user-mode counters
exclude page-fault handling. Code shrank from 2,457 to 2,424 bytes; ELF size is
still 8,712 bytes.

[Raw measurements](results/03-lazy-zero.json). All 720 extended oracle checks and
18 standalone CLI/I/O checks passed.

## 04: stable virtual storage and full-size caches

Reserve the maximum node and continuation capacities within the existing
anonymous mapping. Pages become resident on demand; this eliminates arena and
stack copying, retained old capacities, and address reloads after relocation.
The constructor and memo caches start at their bounded maximum sizes, removing
cache growth/rehashing too. This changes cache residency and node allocation
counts, but preserves immutable IDs and the same exact-key lookup semantics.

Against step 03, wall time fell 16.7% on Fibonacci, 18.5% on exponentiation,
17.7% on rules and 21.2% on sorting. Cycles fell 14.6–22.5%; instructions fell
4.8–9.8%. Branch misses fell on Fibonacci, exponentiation and sorting but rose
5.2% on rules. The tiny size benchmark **regressed 22.1%**, from 1.490 to 1.820 ms:
large caches touch more scattered pages during startup. This is a throughput
tradeoff, not a universal improvement. Code shrank from 2,424 to 1,891 bytes;
ELF file size remains 8,712 bytes.

[Raw measurements](results/04-fixed-storage.json). All 720 extended oracle checks
and 18 standalone CLI/I/O checks passed.

## 05: register-resident reduction machine

The hot loop now makes no calls and performs no process-stack spills. It keeps
the next node ID in r12, inlines constructor sharing, and writes the cursor back
only when evaluation returns. Stable arrays allow cache masks to become
constants. The cold-counter pointer stays in a register across lookup, and its
skip path branches directly to reduction scheduling. Outer registers are saved
once to preserve the input loop's state; there is no general calling convention
inside evaluation.

Against step 04, wall time fell 5.0% on Fibonacci, 1.3% on exponentiation,
9.8% on rules and 6.3% on sorting. Cycles fell 5.3–12.1%, instructions fell
11.9–12.3%, and branches fell 10.8–12.3% on those cases. Rules branch misses fell
41.2%; sorting's rose 1.6%. The tiny size case varied upward another 0.113 ms.
Inlining grew code from 1,891 to 1,951 bytes; ELF file size remains 8,712 bytes.

[Raw measurements](results/05-register-vm.json). All 720 extended oracle checks
and 18 standalone CLI/I/O checks passed. A separate 8,388,608-deep unary input
also confirmed that exhausting the full node arena produces the expected error.

## 06: hardware CRC32C for memo hashing

Use the scalar SSE4.2 CRC32 instruction to hash application-cache keys. Both
lookup and insertion hash the same ordered pair with a zero seed; exact keys are
still compared, so collisions only affect performance. Constructor hashing is
unchanged: the experiment applying CRC32 there did not produce a useful gain.
This executable now requires SSE4.2 (available on the measured i5-8365U).

Against step 05, best-of-seven wall time fell 6.8% on Fibonacci, 1.7% on
exponentiation, 3.4% on rules and 3.6% on sorting. User-mode cycles fell 11.7%,
8.6%, 3.5% and 6.0%, respectively; instructions fell 1.4–2.7%. Branch counts
changed from -1.3% to +0.7%, reflecting different cache residency. Sorting branch
misses rose 4.4%; the other substantial cases improved. Code shrank from 1,951
to 1,914 bytes; ELF size stayed 8,712 bytes.

[Raw measurements](results/06-crc-memo.json). All 720 extended oracle checks and
18 standalone CLI/I/O checks passed.

## 07: recognize the leaf by its ID

ID 1 is the unique leaf, and no constructor creates another leaf node. Compare
IDs directly on the leaf, constant-function and triage-leaf paths instead of
loading a child and testing it for zero. This removes dependent memory reads
without adding node tags or changing the representation or cache behavior.

Against step 06, best-of-seven wall time fell 7.1% on Fibonacci, 14.4% on
exponentiation, 13.9% on rules and 9.2% on sorting. User-mode cycles fell 20.9%,
14.6%, 15.3% and 9.8%, respectively. Instructions fell only 0.6–0.7%; branch
counts were unchanged. Branch misses rose 3.9–8.6% on the first three workloads
and fell 2.3% on sorting. The tiny size case was 0.226 ms slower in this run.
Code grew four bytes to 1,918; ELF file size stayed 8,712 bytes. Code layout
also affects these gains: padding experiments with almost identical instruction
counts showed large runtime changes, so the full speedup cannot be attributed
solely to removing loads.

[Raw measurements](results/07-leaf-id.json). All 720 extended oracle checks and
18 standalone CLI/I/O checks passed. Seven further workload variants (larger
parameters and different sorting distributions) verified the selected combination
and showed improvements over the starting binary.

## 08: fuse leaf-headed continuations

A COMPUTE_AND_APPLY frame holds (x,b), with apply(y,b) already evaluated to r.
When x=fork(leaf,f), apply(apply(x,b),r) becomes apply(f,r). When x=stem(leaf),
it returns b. The evaluator recognizes both cases before decoding the saved
argument or pushing another continuation. It avoids redundant reduction dispatch
and, in the second case, constructing an intermediate constant node. The strict
evaluation of apply(y,b) is preserved. These are general calculus identities,
not recognition of benchmark programs.

GNU as now uses `-mbranches-within-32B-boundaries`. Without this branch-placement
control, the specialized loop lost its benefit in a paired check; the padded
version won on the four substantial cases. This build change accompanies the
new fast paths as one optimization, rather than claiming that padding alone
was beneficial.

Against step 07, best-of-eleven wall time fell 2.9% on Fibonacci, 4.3% on
exponentiation, 7.7% on rules and 2.6% on sorting. Median times fell 6.0%, 2.9%,
6.9% and 5.6%, respectively. Five counter samples per variant showed 5.3–7.8%
fewer cycles, 3.6–8.3% fewer instructions, 7.2–12.2% fewer branches and 5.3–17.8%
fewer branch misses. The tiny size case regressed 0.102 ms in this comparison;
it varied in both directions in screening and is startup dominated.

Code grew from 1,918 to 2,045 bytes, including padding; ELF size stayed 8,712
bytes. All 720 extended oracle checks and 109 standalone checks passed on both
the starting and final binaries. The latter include 90 targeted continuation
cases and a divergent-input check to catch accidentally skipping eager work.
Seven additional workload variants also improved in median time and cycles.

[Raw final comparison](results/08-continuations.json). Explicit prefetching,
other reduction shortcuts, lookup arithmetic changes and layout variants were
screened separately; only this combined continuation specialization was retained.
