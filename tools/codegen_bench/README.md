# Small codegen changes

Measurements on Intel Core i5-8365U, Linux x86-64, pinned to logical CPU 2.
`run.py` alternates before/after executions, warms each workload once, reports
median wall time from seven executions, and separately collects three samples
of user-mode cycles, instructions, branches, and branch misses with `perf stat`.
Every exit status and stdout is checked; the fixed-source compiler must emit
identical bytes across all runs and variants. The optional actual-compiler
pipeline check requires stable output per variant (different code generators
intentionally emit different bytes). Raw samples and counter scheduling percentages are in
`results/`. Small time differences, especially in allocation/page-fault-heavy
fills, can be noise. Instruction counts are stronger evidence of eliminated work;
no fixed speedup is promised across machines. File sizes include ELF alignment;
executable-segment sizes reveal changes hidden by page padding.

All compilers build the same workload sources. In particular, the measured
compiler executable is **the original compiler source compiled by each revised
code generator**, and compiles that same original source on every timed run.
This isolates generated-code performance from changes to compiler algorithms.
The source snapshot is commit `f7b4f23`. The other workloads are the tree-calculus
Fibonacci-24 program with `--reference`, a scalar loop calling a small function,
and allocation/fill of 16 million i32 elements. The Fibonacci input comes from
upstream tree-calculus commit `5679507e357b1107fc9b1647871bc72c38c63748`.

See `run.py --help` and its module documentation for reproduction commands.
Build each candidate with `make selfhost` before running
`python3 tools/codegen_bench/run.py build LABEL --compiler ./l8`. The build checks stage-3/stage-4 fixpoint, the compiler and
callback fixtures, formatting, and browse output. Commit hooks additionally
build and test the staged repository, including the standard library and game.

## 01: branch-only conditions

Integer/pointer comparisons in branch position now preserve flags, including
short-circuit expressions and negation. Value-producing Booleans, floating-point
and string comparisons keep their existing semantics. The text assembler and
emitter now support every signed/unsigned comparison jump used by this path.

Compared with baseline: fixed compiler file size -11.9%, wall time -6.3%,
instructions -15.0%, cycles -6.6%; reference tree wall time -4.7%, instructions
-15.0%, cycles -9.9%. The scalar loop retired 13.3% fewer instructions but showed
no wall-time improvement (+1.0%). The fill workload showed no instruction change;
its +3.9% wall-time difference should not be interpreted as a codegen regression.

## 02: simple operands and final register arguments

Binary operations load literal/constant/local scalar right operands straight into
the operand register, after evaluating the left operand. Complex expressions and
globals retain the general path. Calls with up to six integer argument slots put
the final argument directly into its ABI register, avoiding a push/pop pair.
Nested calls, by-reference returns, mixed SSE arguments and stack arguments retain
their existing ordering and alignment rules.

Compared with 01: compiler wall time -3.5%, instructions -2.3%, cycles -2.7%;
reference tree wall time -7.6%, instructions -4.5%, cycles -8.4%; scalar loop wall
time -20.5%, instructions -10.3%, cycles -21.1%. ELF file sizes stayed unchanged;
compiler executable-segment size increased 0.1%, while tree and loop segments
shrank 0.6% and 0.7%. No meaningful change in fill instructions or cycles.

## 03: omit unused callee-save slots in scalar bodies

A conservative AST whitelist identifies bodies whose generated paths never
modify rbx/r12/r13. These functions omit the six save/restore instructions and
use a smaller, still-aligned frame. Aggregate/index construction, indirect calls,
exception handling, match and unknown paths retain the existing saves. Native
ABI tests check both a scalar callback and an early return inside an aggregate
initializer, where a function-level restore remains necessary.

Compared with 02: compiler wall time -1.9%, file size -2.2%, instructions -3.0%,
cycles -1.9%; scalar loop wall time -3.3%, instructions -17.1%, cycles -4.4%.
Reference tree instructions fell 1.4% and cycles 0.4%, but wall time rose 2.0%;
this does not establish a tree-runtime improvement. Its executable segment shrank
2.3%. Fill code and instruction counts were unchanged. All six C callback tests
passed in addition to the self-host/fixture checks.

## 04: fold nontrapping integer constants

Fold literal/const integer and Boolean arithmetic, bitwise operations, unary
operations, and comparisons using the existing width-aware constant evaluator.
Leave division, remainder, shifts, conversions, floating-point operations and
side-effecting expressions alone. Tests compare folded expressions with dynamic
ones, including narrow overflow and negative floating-point comparisons, and
ensure an unreachable division by zero still compiles without being evaluated.

This is primarily a code-quality improvement: compiler executable segment -0.1%,
instructions -0.1%, cycles +0.2%, wall +1.9%; tree segment -0.2%, instructions
-0.2%, cycles -1.7%, wall -0.8%. Loop/fill instruction counts are effectively
unchanged. These samples do not demonstrate a material wall-time benefit from
constant folding on these workloads. ELF file sizes remain unchanged.


## 05: bulk 32-bit scalar fills

Use `rep stosl` for i32/u32/f32 array fills, preserving fill evaluation exactly
once even for zero-length arrays. Byte and 64-bit fills were already bulk stores;
aggregate fills retain the previous path. Add assembler support for the bulk-store
mnemonics and `cld`, and a compile/as/elfpack regression check alongside direct
build tests. Tests cover empty/one/odd-length arrays, signed and unsigned bit
patterns, floating-point fills and fill side effects.

Compared with 04: fill wall time -45.9%, user cycles -84.4%, executable segment
-1.3%; compiler/tree/loop binaries are byte-identical to 04. Almost all retired
loop instructions and branches disappear, but `rep stos` retired-instruction
counts are not a count of the individual memory stores it performs. User-mode
counters also exclude kernel page-fault work included in wall time.

## Combined result

Fresh comparison of baseline versus all five changes, rather than multiplying
per-change speedups. Median wall time; seven alternating samples on CPU 2:

| Workload | Before | After | Wall reduction | File bytes before → after | Executable segment reduction |
|---|---:|---:|---:|---:|---:|
| Fixed-source compiler | 436.88 ms | 392.90 ms | 10.1% | 827,925 → 713,237 | 14.9% |
| Reference tree evaluator | 268.91 ms | 235.28 ms | 12.5% | 21,499 → 21,499 | 12.6% |
| Scalar loop and calls | 61.88 ms | 47.74 ms | 22.8% | 8,192 → 8,192 | 3.9% |
| 32-bit array fill | 14.41 ms | 8.01 ms | 44.4% | 8,192 → 8,192 | 3.2% |

The fixed-source compiler retired 19.4% fewer instructions and 16.0% fewer
branches, with 12.6% fewer cycles and 7.1% fewer branch misses. The reference tree
evaluator retired 20.1% fewer instructions, with 13.9% fewer cycles and 29.8%
fewer branch misses. See `06-combined.json` for every counter and sample.

A separate **actual compiler throughput** check includes the added AST analysis
and constant folding, compiling the same fixed input with the original and new
compiler implementations. Wall time fell from 428.21 ms to 376.24 ms (12.1%);
instructions -20.2%, cycles -12.2%, branches -16.7%, branch misses -6.2%.
The actual compiler executable shrank from 827,925 to 721,675 bytes (12.8%),
including the new implementation. Run this check with:

```sh
python3 tools/codegen_bench/run.py compare baseline fills --only-pipeline \
  --output .build/codegen-perf/pipeline.json
```

All perf events had 100% counter running time in these samples (no multiplexing).
The final compiler also passed all 1,440 tree-calculus checks across native and
reference modes, its native layout/growth/collision checks, and all six C ABI
tests. Every optimization passed self-host fixpoint and compiler fixtures; commit
hooks validate the full staged build and formatting.

Measurement labels map to the following revisions. `git_head` in each manifest
records the parent at measurement time, before committing that optimization;
compiler and workload binary checksums identify exactly what was measured.

| Label | Revision |
|---|---|
| baseline | `f7b4f23` |
| branches | `8d106c5` |
| operands | `2beae5b` |
| frames | `2fe082d` |
| constants | `855a079` |
| fills | The revision introducing this section and `05-fills.json` |

For historical comparisons, build each revision's compiler in a separate Git
worktree and pass its `l8` path to this revision's `run.py build`. Keep the fixed
source archive and benchmark fixtures unchanged, and avoid other CPU-intensive
work while measuring. Generated compilers and temporary outputs live under
`.build/codegen-perf`; measurements and reproducible inputs are tracked here.
