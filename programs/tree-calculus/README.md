# Tree calculus

An L8 interpreter with a native x86-64 reduction kernel for the triage-calculus
rules used by [lambada-llc/tree-calculus](https://github.com/lambada-llc/tree-calculus).
Build and run from the lang8 repository root:

```sh
./l8 build programs/tree-calculus/main.l8 -o .build/tree-calculus
printf '21100\n2100\n' | .build/tree-calculus
# 2100
```

Input matches the upstream C++ benchmark interface: one prefix-encoded tree per
line, left-fold applied starting from the identity `21100`. `0` is a leaf,
`1` precedes a stem's child, and `2` precedes a fork's two children. Empty lines
are skipped, CR bytes are ignored, and the last line need not end in a newline.
The fully normalized result is printed as one ternary line. Empty input prints
the identity. Malformed trees produce an error on stderr and a nonzero exit.
This is the triage variant used by the benchmarks, not the alternative Jay rules.

Pass `--reference` to select the L8 reduction loop for debugging and differential
checks. It shares the immutable node representation and input/output code with
the native backend, but implements reduction independently. It is not the
original, pre-optimization interpreter: layouts and node sharing have changed.

## Standalone assembly version

[`assembly/`](assembly/README.md) contains a fully standalone Linux x86-64
executable with assembly parsing, I/O, allocation and a separately specialized
reduction kernel. It requires SSE4.2 and GNU `as`/`ld`, with no L8 compiler or
runtime. Its comparison runner can measure all three implementations on
the same workloads.

## Implementation

`tree.l8` provides the reference reducer, parser, printer and data structures;
`reduce.s` implements the native hot loop; `native.l8` handles capacity policy.
Nodes pack two 32-bit IDs into 8 bytes. Node-cache and application-cache entries
contain a packed key and a result ID in 16 bytes. An ID always denotes the same
immutable node for the lifetime of the machine.

The node constructor uses a **bounded cache**, not full canonicalization. A
matching child-pair key reuses the cached node. A collision allocates a new node
and replaces the cache entry; the old node remains valid. Structurally identical
trees can consequently have different IDs. This removes probing through a large
intern table and the dependent loads needed to compare candidate nodes. Losing
sharing can increase allocations or repeat reductions, but never changes a
result: application-cache hits require an exact match of both immutable IDs.
Do not use ID equality as a test of structural equality.

Both caches start at 512 entries. As the native evaluator allocates nodes, the
node cache grows to at most 16,384 entries and the application cache to at most
65,536. Growth preserves entries where possible. The native application cache
also backs off after 64 misses for a function slot, sampling one in sixteen
lookups until a hit resets the counter. Constructors and direct projections
bypass application caching. These policies depend on allocation and lookup
behavior, not the program's identity or expected answer.

The kernel keeps reduction state in registers and uses the same eager rules
and evaluation order as the reference loop. Parsing, reduction and printing
use explicit growable stacks. Native buffers and arrays use the L8 runtime heap
with bulk zeroing and copying, including the input/output buffers: avoiding
byte-at-a-time initialization matters for short programs. There are no recursive
evaluator calls or benchmark-specific shortcuts.

The kernel is a trusted memory-access boundary: L8 does not check its native
loads. It relies on valid node IDs, nonempty power-of-two cache capacities and
the documented record/slice layouts. L8's built-in assembler
builds it directly; no host C compiler or external assembler is required.
The development assembler accepts the bulk-copy and zeroing mnemonics used
by the kernel. Build the compiler stages before using them with a saved
bootstrap that predates that support.

This is a one-shot interpreter. Nodes and superseded array capacities remain
allocated until process exit; there is no garbage collector. Cache eviction does
not reclaim nodes. The arena is capped at approximately 8 million nodes, input
lines at 16 million bytes, and stack capacity at 16 million frames. These are
ceilings, not guaranteed allocations: the runtime heap and available memory may
limit execution earlier. Compared with full canonicalization, bounded sharing
can reach the node limit earlier on some programs. Divergent terms have no
reduction limit; use an external `timeout` when experimenting.

## Benchmarks

The runner reads program encodings and workload sizes from an upstream
checkout's `benchmark/run.sh`; it does not download or execute upstream scripts.
It verifies every timed output, interleaves variants with rotating order, and
reports the best of five process wall times by default, including startup and
I/O. It exits nonzero if **any** variant produces a wrong result, crashes, or
times out. The default two-second timeout and raised stack limit match upstream.

```sh
git clone https://github.com/lambada-llc/tree-calculus.git /tmp/tree-calculus
python3 programs/tree-calculus/bench.py /tmp/tree-calculus

# Build competitors first, then compare them on exactly the same workloads.
bash /tmp/tree-calculus/implementation/asm/build.sh x64-noid x64-minbin
python3 programs/tree-calculus/bench.py /tmp/tree-calculus --runs 7 \
  --compare 'ASM noid=/tmp/tree-calculus/implementation/asm/bin/x64-noid' \
  --compare-minbin 'ASM minbin=/tmp/tree-calculus/implementation/asm/bin/x64-minbin' \
  --json .build/tree-calculus-results.json

# With an upstream C++ build:
python3 programs/tree-calculus/bench.py /tmp/tree-calculus \
  --compare 'C++ graph=/tmp/tree-calculus/implementation/cpp/main.exe --evaluator eager-graph-nil-mmap-32'

# Compare the independently implemented L8 reduction loop:
python3 programs/tree-calculus/bench.py /tmp/tree-calculus \
  --compare 'reference=.build/tree-calculus --reference'
```

`--compare LABEL=COMMAND` and `--compare-minbin LABEL=COMMAND` are repeatable;
commands are split into arguments and never executed through a shell. Minbin
comparisons convert both the input application and expected output, preserving
the workload. `--runs`, `--timeout`, and `--binary` are configurable. `--json`
saves every timing sample, command, protocol, status and logical-input checksum.
