# Tree calculus

An L8 interpreter with a native x86-64 reduction kernel for the triage-calculus
rules used by [lambada-llc/tree-calculus](https://github.com/lambada-llc/tree-calculus).
Build and test from the lang8 repository root:

```sh
./l8 build programs/tree-calculus/main.l8 -o .build/tree-calculus
printf '21100\n2100\n' | .build/tree-calculus
# 2100
python3 programs/tree-calculus/test.py
./l8 build programs/tree-calculus/test-native.l8 -o .build/tree-calculus-test
.build/tree-calculus-test
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

The kernel is a trusted memory-access boundary: native loads are not checked by
L8's bounds verifier. It relies on valid node IDs, nonempty power-of-two cache
capacities and the documented record/slice layouts. L8's built-in assembler
builds it directly; no host C compiler or external assembler is required. Bulk
string instructions use annotated `.byte` encodings because the built-in
assembler does not accept their mnemonics.

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

Measured on 2026-10-03 on an Intel Core i5-8365U, Linux x86-64, against upstream
commit `5679507e357b1107fc9b1647871bc72c38c63748`. **L8 wins all five mini-suite
workloads against the tested roster on this machine.** Final comparison, best
of seven interleaved runs including startup and I/O:

| Workload | L8 | Fastest other | Other time | Speedup |
|---|---:|---|---:|---:|
| size | 0.227 ms | ASM noid | 0.333 ms | 1.46× |
| recursive-fib | 23.932 ms | C++ GCC graph | 54.909 ms | 2.29× |
| silly-exp | 26.108 ms | C++ Clang peek32 | 33.756 ms | 1.29× |
| exercise-rules | 46.678 ms | C++ Clang peek32 | 60.322 ms | 1.29× |
| merge-sort | 48.723 ms | C++ GCC graph | 86.694 ms | 1.78× |

`graph` is `eager-graph-nil-mmap-32`; `peek32` is
`eager-ternary-nil-mmap-32-peek`. The final run included all six assembly
evaluators and five fastest C++ configurations selected from the broader scan.
Every output in this final comparison passed. The tiny `size` workload is
particularly sensitive to process-startup noise.

The broader seven-run scan covered 32 distinct upstream evaluators in 51
configurations: 19 C++ evaluators built with both GCC and Clang, six assembly,
three JavaScript, three WebAssembly and Python. It used the new bounded-cache
kernel before the final improvement to initialization of the machine arrays.
Some slower competitors timed out or failed; these remain recorded as failures.
Lean was not tested because its `lake` toolchain was unavailable.

C++ builds used GCC 12.2 and Clang 14, `-O3 -std=c++20`, with libstdc++ rather
than upstream's Clang/libc++/C++23 setup. The local driver omitted the include
and registry entry for `LazyAppStream` (already excluded from the official
suite) because this host lacks `append_range`; evaluator sources were unchanged.
JavaScript/WebAssembly used Node 26.7.0; Python was 3.11.2.

[Saved measurements](benchmark-results.json) include both scans, all samples,
commands, failures and source/binary checksums. These results establish the lead
on the measured machine and workloads, not on every CPU or arbitrary program.


## Validation

`test.py` checks both backends against an independent Python reduction oracle:
all pairs of trees up to five nodes, 400 deterministic random applications,
malformed inputs, and deep trees that exercise buffer/stack growth and large
output. A 12,000-step nested application forces continuation growth during
reduction. The 1,412 CLI checks run with the normal OS stack limit. The extended
run also passed all 1,440 checks, including upstream programs at additional
sizes to check beyond the timed workloads:

```sh
python3 programs/tree-calculus/test.py --upstream /tmp/tree-calculus
```

`test-native.l8` checks the shared binary layouts, forced arena and stack growth,
preservation of caller continuation frames, cached-node reuse, and deliberate
node/application-cache collisions. In particular, it verifies that evicted nodes
remain valid and that equivalent nodes may receive different IDs. Python is
needed only for testing and benchmarking; the interpreter is a static executable
with no libc or upstream dependency.
