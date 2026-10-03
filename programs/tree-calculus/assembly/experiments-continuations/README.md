# Prefetch and continuation experiments

Starting from `5939482`, tested **41 variants** spanning prefetch placement,
reduction shortcuts, lookup arithmetic and code layout. Retained one combined
optimization in `ea70307`: specialize pending applications whose function has
leaf as its first child, with assembler-controlled branch placement. No explicit
prefetch instruction was retained.

## Final measurement

Fresh comparison on the same i5-8365U, pinned to CPU 2, with eleven interleaved
wall-time samples and five separate samples of each user-mode hardware counter.
Every invocation checked its output. These numbers compare the selected binary
against this round's starting assembly, not against a historical timing or an
upstream competitor.

| Workload | Before | After | Best-time change | Median-time change |
|---|---:|---:|---:|---:|
| Size | 1.726 ms | 1.828 ms | +5.9% | +6.9% |
| Fibonacci | 12.900 ms | 12.521 ms | -2.9% | -6.0% |
| Exponentiation | 13.261 ms | 12.695 ms | -4.3% | -2.9% |
| Rules | 21.706 ms | 20.024 ms | -7.7% | -6.9% |
| Merge sort | 22.053 ms | 21.489 ms | -2.6% | -5.6% |

The tiny size case regressed by 0.102 ms in this run and varied in both directions
in screening. The retained optimization targets the substantial workloads; it is
not a universal win.

| Workload | Cycles | Instructions | Branches | Branch misses |
|---|---:|---:|---:|---:|
| Fibonacci | -7.6% | -5.9% | -8.9% | -10.5% |
| Exponentiation | -5.3% | -4.0% | -7.2% | -10.5% |
| Rules | -7.8% | -8.3% | -12.2% | -17.8% |
| Merge sort | -5.3% | -3.6% | -8.0% | -5.3% |

Code increased from 1,918 to 2,045 bytes, including padding; ELF file size stayed
8,712 bytes. The ISA requirement remains SSE4.2. All counter samples ran without
multiplexing. [Raw final comparison](../results/08-continuations.json).

## What the retained change does

A pending S-rule continuation holds x and b, after apply(y,b) has produced r.
It normally computes apply(x,b), then applies that result to r. Two shapes allow
that sequence to collapse:

- x=fork(leaf,f): apply(apply(x,b),r) equals apply(f,r).
- x=stem(leaf): apply(apply(x,b),r) equals b.

The first path skips a separate reduction and continuation push/pop. The second
also avoids constructing the temporary constant node fork(leaf,b). Both paths
run **after apply(y,b) completes**, preserving eager evaluation even when that
work would diverge. Saved argument decoding is delayed until it is actually
needed. Nodes, cache sizes, hashes and continuation formats are unchanged;
skipping allocations can still change later IDs and cache residency.

GNU as now receives `-mbranches-within-32B-boundaries`. A separate final paired
check found that the same shortcut without this flag lost its benefit: median
times were roughly unchanged on Fibonacci/exponentiation and 2–6% worse on
rules/sorting, while the padded version improved all four. The flag is a necessary
part of this retained implementation on the measured CPU. Padding alone was not
a convincing improvement. [Layout check](../results/continuations/layout-final.json).

## Why prefetch did not survive

The starting binary's retired L3 load-miss counts were only about 650–9,400 per
substantial workload, versus roughly 0.95–2.67 million L1 load misses. Most misses
were serviced by cache. The observed stalled cycles with L1D misses outstanding
were about 5–15% of user-mode cycles. These overlapping stall indicators are not
an additive breakdown of execution time.

[Profile samples](../results/continuations/memory-profile.json) include L1/L2/L3
load misses, memory-stall indicators, decoded-cache versus legacy-decoder uops,
and page walks, measured in separate groups to avoid counter multiplexing.

Tested prefetching the deferred S-rule function and argument with T0/T1/T2/NTA
hints, the deferred triage argument, combinations of these, and future allocation
lines with PREFETCHW at two distances. None gave a repeatable broad improvement.
Prefetching was also tried alongside the faster reduction path with branch
placement controlled; it added no convincing benefit over that path alone.
This rejects these placements on these workloads, not software prefetching in
general or other possible prefetch distances.

## Other experiments

- Fusing the leaf-function case alone added checks more often than it saved work.
- Recognizing the initial identity ID or the corresponding S shape did not win.
- Directly entering construction for a leaf S operand did not consistently win.
- Shortening memo pointer arithmetic, retaining the cold counter in a register,
  and shortening constructor addressing did not give a sufficiently repeatable
  additional gain. Some combinations helped individual cases but hurt others.
- Hashing the stored pair order directly changed cache behavior without a clear
  overall advantage.
- Constant-only continuations helped; extending that specialization to
  stem(leaf), and testing before decoding the saved argument, gave the selected
  result. No benchmark names or expected answers occur in the fast paths.

Screening used nine shuffled, interleaved wall-time samples, one warmup, and
three separate counter samples per workload/variant. Raw rounds:
[prefetch](../results/continuations/prefetch.json),
[initial shortcuts](../results/continuations/fusions.json),
[padded shortcuts](../results/continuations/padded.json),
[lookup changes](../results/continuations/lookup.json),
[combinations](../results/continuations/combined.json), and
[final shortcut shapes](../results/continuations/headed.json).
The final layout check used eleven timing samples. Do not combine minima from
separate rounds as if they were interleaved measurements.

## Validation and reproduction

The starting and selected binaries both passed **829 checks**: 720 extended
oracle checks and 109 standalone checks. The latter include 90 targeted
continuation cases and one deliberately divergent case that catches skipping
required eager work. The retained commit also passed the full repository build
hook. All screened timing runs checked expected outputs; rejected variants are
experimental patches, not supported alternate backends.

Seven additional workload variants (larger parameters and different sorting
distributions) showed roughly 1–9% lower median wall time and 6–12% fewer cycles
for the selected version. The closest cases were already-sorted and duplicate-
heavy inputs. These additional cases helped validate the candidate combinations;
they are not claimed as an independent blind holdout.
[Samples](../results/continuations/holdout.json).

All 42 builds, including the baseline, were reconstructed from the archived
patches and reproduced their recorded SHA256 hashes. Run from the repo root:

```sh
python3 programs/tree-calculus/assembly/experiments-continuations/replay.py --check-hashes
export TREE_CALCULUS_UPSTREAM=/path/to/lambada-llc/tree-calculus
python3 programs/tree-calculus/assembly/experiments-continuations/screen.py replay.json base headed-early-constant
HOLDOUT=1 python3 programs/tree-calculus/assembly/experiments-continuations/screen.py additional.json base headed-early-constant
python3 programs/tree-calculus/assembly/experiments-continuations/profile.py
```

GNU binutils 2.40, Python 3, `patch`, and working perf counters are required to
reproduce the original setup. Screening uses CPU 2. `replay.py` writes only to
`.build/tree-calculus-memory/` by default and never alters production sources.
Use `--output` and `TREE_TRICKS_BUILD` together to choose a different directory;
omit `--check-hashes` with another binutils version. [The manifest](manifest.json)
records the base revision, individual patches, assembler flags and binary sizes.
