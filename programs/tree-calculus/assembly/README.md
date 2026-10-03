# Standalone assembly tree calculus

A Linux x86-64 executable written entirely in assembly, requiring SSE4.2
(the scalar CRC32 instruction used for memo hashing). It includes its own
startup, syscall I/O, parser, printer and allocator.
The standalone kernel is specialized separately; see [optimization results](TUNING.md).
The optimized version takes 25–37% less wall time than the original standalone
on the four substantial upstream workloads, with a 0.28 ms regression on the
tiny size case. It links no L8-generated code, L8 runtime or libc. GNU `as` and `ld` are the only
build dependencies:

```sh
programs/tree-calculus/assembly/build.sh
printf '21100\n2100\n' | .build/tree-calculus-asm
# 2100
python3 programs/tree-calculus/assembly/test.py
# Optional additional upstream workload sizes:
python3 programs/tree-calculus/assembly/test.py --upstream /tmp/tree-calculus
```

`build.sh [output]` accepts an alternative output path. Run the executable with
no arguments. Input/output follow the [L8 version](../README.md): prefix ternary
trees, one per line, left-fold applied from identity `21100`. Empty lines and CR
bytes are ignored, EOF may terminate the final line, and malformed input fails
with a diagnostic and nonzero exit. Empty input prints the identity. This version
has no `--reference` option; use the L8 executable for that backend.

## Implementation and limits

`main.s` implements the standalone portions and includes [`kernel.s`](kernel.s),
a private specialization of the original [`reduce.s`](../reduce.s) kernel.
The entire resulting executable is assembly, but this is deliberately **not an
independent reduction algorithm**. Both versions use immutable packed node IDs,
bounded constructor sharing, memoized eager reduction and adaptive cache lookup.
The original standalone version shared the kernel source. The specialized
version keeps its semantic rules but can now change its internal representation
and calling conventions independently. The Python oracle checks both versions.

The standalone parser uses that kernel's constructor and fixed-size caches.
The L8 parser uses its L8 constructor and grows caches before reduction; this
changes cache residency and allocation counts while preserving results. The standalone printer traverses nodes directly, uses an explicit
stack, and appends its final newline to the buffered output. Reads and writes
handle EINTR; writes handle partial progress. No parser or evaluator recursion
uses the process stack.

As in the L8 runtime, a bump allocator reserves a 768 MiB anonymous mapping and
retains allocations until exit; there is no garbage collector. Most pages are
not committed until touched. Node and continuation arrays reserve their maximum
virtual capacities once; only the input line buffer grows by copying. Constructor
and application caches have 16,384 and 65,536 entries, respectively.
Limits are 8,388,608 node slots, 16,777,216 continuation frames and 16,777,216
bytes per input line. The heap budget can be reached before an individual limit.
A divergent reduction has no step limit; use an external timeout when needed.
The native code relies on internally valid node IDs and layouts. Cache eviction
never invalidates existing nodes.

## Initial version: comparison with L8

The following measurements describe the initial standalone version (`6a63ddf`);
[optimization results](TUNING.md) track subsequent changes. Measured on Intel Core i5-8365U, Linux x86-64, pinned to logical CPU 2. The L8
executable was rebuilt with promoted compiler `0cabbce`; upstream benchmark
sources were commit `5679507e357b1107fc9b1647871bc72c38c63748`. GNU binutils 2.40
built the standalone executable. Best of seven rotating, interleaved process
wall times, including startup and I/O; every output checked:

| Workload | L8 with native kernel | Full assembly | Assembly speedup | Pure L8 reference |
|---|---:|---:|---:|---:|
| Size | 1.390 ms | 1.379 ms | 1.01× | 1.393 ms |
| Fibonacci | 25.596 ms | 23.264 ms | 1.10× | 221.499 ms |
| Exponentiation | 28.385 ms | 26.056 ms | 1.09× | 152.319 ms |
| Reduction rules | 47.725 ms | 44.543 ms | 1.07× | 292.928 ms |
| Merge sort | 46.127 ms | 40.219 ms | 1.15× | 528.680 ms |

The tiny size case is startup dominated and effectively tied. For the substantial
cases, full assembly uses 6.7–12.8% less wall time than the default L8/native
executable, and is 5.85–13.14× faster than the pure L8 reduction loop. These are
measurements on this machine and suite, not guarantees for other workloads.

| Executable | File bytes | Executable-segment bytes |
|---|---:|---:|
| L8/native (also contains reference backend) | 21,499 | 12,912 |
| Full assembly | 8,712 | 2,645 |

The size comparison includes the L8 executable's optional reference backend and
runtime support. Both executables are static; full assembly has no dynamic
interpreter or shared-library dependencies and has a non-executable stack.

Three separate perf runs collected user-mode cycles, instructions, branches and
branch misses, with 100% counter running time (no multiplexing). Relative to
L8/native, full assembly reduced cycles by 9.5% on Fibonacci, 9.1% on
exponentiation, 7.8% on rules and 16.0% on sorting. Instruction counts on the first
three are almost unchanged; sorting retires 11.3% fewer instructions and 6.8%
fewer branches. The entire gain cannot be attributed to removal of L8 code:
GNU as also chooses different instruction encodings and branch lengths, and code
layout can affect execution time even with the same kernel source.

[Raw results](benchmark-results.json) include every timing and counter sample,
commands, source/binary checksums, tool versions, and both best and median times.
Reproduce the build and comparison with:

```sh
python3 programs/tree-calculus/assembly/compare.py /tmp/tree-calculus --cpu 2
```

This comparison script requires the checked-in L8 bootstrap to build the L8
competitor, plus Python and working user-mode perf counters. Building or running
the assembly executable itself needs none of those. Select a CPU allowed by your
affinity mask; without `--cpu`, the script chooses the first available CPU.

Validation passed 720 shared oracle/CLI checks (including 400 random terminating
programs and upstream programs at additional sizes), plus 18 standalone checks
for fragmented reads, buffer boundaries, many input lines, CR handling, command
line errors, line limits, mmap failure and read/write failure. The promoted L8
competitor also passed its full 1,440 checks in both modes.
