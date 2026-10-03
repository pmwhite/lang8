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
