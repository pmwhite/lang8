# Standalone assembly optimization

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
