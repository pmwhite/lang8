# Code generation benchmarks

`run.py` builds the same fixed source workloads with two compiler versions,
checks their output, and compares process wall times and user-mode `perf`
counters. It runs on Linux with Python, `perf`, and an allowed CPU affinity.
No benchmark runs as part of `make`.

Prepare the fixed compiler/program snapshot once from the checkout root:

```sh
mkdir -p .build/codegen-perf/source
git archive f7b4f23 src2 runtime.s stdlib programs/tree-calculus | tar -x -C .build/codegen-perf/source
```

Build and validate each compiler revision with `make -j4 selfhost
compiler-test`, save its executable under `.build/`, and build the fixed
workloads with each:

```sh
python3 tools/codegen_bench/run.py build before --compiler .build/l8-before
python3 tools/codegen_bench/run.py build after --compiler ./l8
python3 tools/codegen_bench/run.py compare before after --cpu 2 --output .build/codegen-perf/comparison.json
```

Choose a CPU allowed by the host's affinity mask. Results and generated
binaries stay under `.build/codegen-perf/`. `--runs` and `--counter-runs`
control samples; `--only-pipeline` measures compiler throughput on fixed
input. Use `--help` for options.

The workloads cover compiler self-compilation, tree-calculus Fibonacci,
scalar loops and array fills. Wall times include process startup and I/O;
the runner alternates order and records medians and raw samples. Small
timing changes can be noise. Compare output, instructions and cycles along
with time; measurements apply to the selected machine and workload.
