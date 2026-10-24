# Standalone assembly tree calculus

A Linux x86-64 executable written entirely in assembly, requiring SSE4.2
(the scalar CRC32 instruction used for memo hashing). It includes its own
startup, syscall I/O, parser, printer and allocator.
It links no L8-generated code, runtime or libc. GNU `as` and `ld` are the
build dependencies; the assembler must support
`-mbranches-within-32B-boundaries`.

```sh
programs/tree-calculus/assembly/build.sh
printf '21100\n2100\n' | .build/tree-calculus-asm
# 2100
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

## Compare implementations

```sh
python3 programs/tree-calculus/assembly/compare.py /path/to/tree-calculus-upstream
```

The runner builds standalone assembly and the L8 implementation, checks each
workload's output, and compares assembly, native L8 and reference L8. It
requires Python, the checked-in bootstrap and working user-mode `perf`
counters. `--baseline PATH` adds a saved assembly executable; `--cpu N`
selects a CPU (otherwise the first allowed CPU is used). `--runs` and
`--counter-runs` control sample counts.

Reports default to `.build/tree-calculus-assembly/benchmark-results.json`;
`--output PATH` changes that location. Generate fresh measurements for the
machine and revision being evaluated.
