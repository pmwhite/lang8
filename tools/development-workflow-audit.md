# Development workflow audit — 2026-10-21

Follow-up: at the owner's request, the CAD and race test suites, their Make
targets and the CAD sketch fixture have been removed. Timings and proposals
below describe the repository before that removal.

## Conclusion

Improve test selection, commit validation and failure diagnosis before optimizing
the compiler. Useful integration tests are being run at the wrong frequency.
No test removal or hook/build behavior change was made during this audit.

## Evidence and scope

Reviewed recent project threads through T3's durable activity API, including
the full available parent timelines for Native iPhone UI (2,248 items), PCB
Designer (864) and Run/Ride Tracking (1,033), the Web Bible parent (95), a
snapshot of the active Bible refactor, and the first 100 items of its older
Round 5 builder. Older migrated timelines sometimes contain only messages;
child tool details and tool timing fields are incomplete. This is a qualitative
audit with concrete step timings, not an exhaustive error-rate/latency study.

Sources:

- [Bible refactor](t3-thread://v1/947ee307-4b66-4adc-b6f6-8ff6b6b2b148):
  activity positions 24, 40, 54, 62, 68–88 and 102–110.
- [Web Bible](t3-thread://v1/bffff622-0578-408d-983e-3119d0c6863f):
  positions 18, 51 and 68.
- [Native iPhone UI](t3-thread://v1/73898d19-7543-40fe-a2c8-fc3099bdad06):
  positions 1088, 1111–1115, 1266–1268, 1343–1353, 1375, 1925 and 2168–2221.
- [PCB Designer](t3-thread://v1/60bf5966-6850-4a4e-baf8-fcb937866d71):
  positions 743, 773 and 796 document repeated routing-test timeouts.
- [Run/Ride Tracking](t3-thread://v1/65d854b3-515f-4081-ac6f-0f44eafb3e62):
  position 158 records simulation timeouts under emulation/load.

Current checkout inspected: `1484cf8f`. Other threads have newer/different
layouts; recommendations must be adapted to the branch implementing them.

## Measured costs

Ran `python3 tools/profile.py self game fmt --compiler ./l8c3 --runs 3 --phases`
in this checkout. Warm-run medians:

- Compiler self-build: **104.5 ms** (parse 45.9 ms, typecheck 20.3 ms,
  code generation 31.4 ms).
- Block-game build: **78.9 ms**.
- Formatting all src2 files to stdout: **77.9 ms**.

Thread step timings are wall times under differing load, not controlled
benchmarks, and parallel steps must not be added as though sequential:

- Bible-focused validation: native 12.8 s, wasm 20.6 s, data checks 7.0 s,
  worker 0.38 s, iOS assembly 0.39 s, simulator executable 1.67 s.
- Bible refactor commit retry: race 44.4 s, CAD 33.5 s, native Bible 15.8 s,
  wasm Bible 21.0 s, data 7.3 s. Previous attempt hit CAD's 60-second test
  timeout and rejected the commit. Restricting CPU affinity to four CPUs
  coincided with the retry passing; this is not a controlled proof of cause.
- Web Bible commit: race 53.3 s, CAD 51.2 s, native Bible 32.5 s,
  wasm Bible 44.0 s, data 12.5 s, site generation 10.0 s.
- A focused cold Web Bible build took 4.44 s, including 3.99 s site generation.

## Highest-value changes, in order

### 1. Stop rebuilding/testing everything for every commit

`.githooks/pre-commit` creates a fresh temporary checkout with `checkout-index`,
runs default `make -j$(nproc)`, formats/checks all tracked L8 files and removes
the checkout. This discards incremental build/test state every commit, including
documentation commits. It correctly validates the staged tree; retain that
property when making it faster.

Introduce a dedicated staged-check entry point that classifies changed paths:
documentation-only checks; app-specific tests/builds for app edits; broad checks
for compiler/runtime/stdlib or unknown shared changes. Classify renames and
deletions as well as additions. Derive affected roots from actual imports rather
than assuming directories are isolated. Keep an explicit full-check command and
ensure a CI job runs the full suite, since the current workflows are mainly
app-specific. Avoid changing the hook's coverage until that safety net exists.

Format-check changed staged L8 files first so an unformatted file fails before
an expensive suite. Retain the full format check for formatter changes or a
separate broad check. A persistent staged workspace could help later, but must
remove deleted inputs, serialize access and key results by staged content,
compiler, runtime, tools and flags; copying arbitrary `.build/ok` stamps is unsafe.

### 2. Fix overbroad dependencies and split Bible validation

`Makefile`'s `PROGRAMS` includes every `.l8`/`.s` file under programs and stdlib.
Most app builds and suite stamps depend on it. A recipe edit therefore
invalidates Bible, CAD, race and other unrelated targets in an ordinary warm
checkout. Use compiler-generated dependency files covering transitive imports
and native sources; explicitly retain data/generator/runtime inputs.

The single Bible native stamp also combines L8 tests, worker JS tests, Python
data checks and building the spoken-text tool. Give these separate stamps and
inputs. Editing UIKit should not regenerate/check unrelated language datasets.
This also makes failures and timings easier to interpret.

### 3. Separate expensive integration tests from quick feedback

CAD's complete handheld autoroute and race's long driving simulations are
valuable integration coverage. Running them for Bible text/privacy edits is
wasted work. Keep them for affected changes and broad CI. Do not merely raise
all timeouts: CAD has repeatedly approached/exceeded its 60-second wall limit.

`programs/race/test_drive.l8` calls `test_build()` in 20 tests. Each builds the
track and a 640,000-capacity world mesh; processes are isolated by the test
runner. Profile whether physics-only tests can skip world-mesh construction or
use smaller deterministic fixtures. Keep a separate full-course integration
check. CAD should similarly keep small routing invariants plus full-board checks.
These are optimization candidates, not measured per-case bottlenecks yet.

Make job counts configurable with a conservative default on shared machines.
The runner already supports make jobserver tokens, so fix scheduling/budgets
rather than wrapping it in more nested parallel runners. Investigate any timeout
in isolation and under contention before calling it a behavioral regression.

### 4. Improve observability before tuning tool calls

`tools/step.sh` prints elapsed time but does not append elapsed time or exit
status to successful step logs, and logs are overwritten on each run. Save
structured records with step, revision/staged-tree identity, command, duration,
exit status and job count. Add per-file/per-case test timings and retain slowest
cases. This would identify whether data loading, simulation or scheduling dominates.

T3 activity exposes completion timestamps and summarized output here, not a
consistent start/end pair for every tool. Do not mistake adjacent message gaps
for tool latency. Instrument provider/tool start, end, queue time, output size
and retry reason in T3 if a real tool latency ranking is needed.

## Errors and avoidable agent work

- The long iPhone parent has five explicit provider error entries: two
  `Claude API unknown` and three consecutive turn-start failures. A child
  stalled for 600 s; another failed with invalid JSON involving a control
  character near column 4,837,016. These warrant T3/provider transport logs,
  bounded retries and investigation of large-context serialization. They are
  not compiler/test failures. The timeline does not establish the root cause.
- The Web Bible parent shows one transient preview capture failure: the page
  changed during capture, and the tool explicitly requested another snapshot.
  This is not evidence of a chronically slow browser tool.
- The active refactor had lifetime errors, malformed generated edits and record
  layout/crash debugging. Some exposed real compiler/import-order behavior;
  they are not all careless agent mistakes. Use small compileable refactoring
  steps and minimal record/lifetime fixtures before bulk replacements.
- Some command failures were optional missing-file probes or missing Pillow,
  so counting every nonzero command as a product defect would be misleading.
- `programs/testing/README.md` still recommends missing `tools/lib_expect.py`
  and obsolete `build --expect`. Use `TESTING.md`; retire/update that README.
- `BOOTSTRAP.md`'s `check` summary understates the current broad suite. Keep
  command descriptions aligned with `Makefile` so agents choose appropriate checks.
- During this audit, `make -n -W ... check` unexpectedly ran `+` test recipes.
  The audit process tree was stopped. Do not use dry runs as a side-effect-free
  dependency inspection mechanism in this Makefile.

## CI and host reliability

Historical iPhone CI lost roughly 11 minutes waiting behind another run in one
recorded example; fresh simulator boots cost minutes. The current workflow
already excludes Bible markdown/site-only changes from the iOS trigger, caches
the compiler and uses five simulator jobs. Those are existing improvements,
not new proposals. It still uses one workflow concurrency group with
`cancel-in-progress: false`, and web/iOS jobs share the workflow trigger.

Next: isolate fast web feedback from the simulator pipeline and use changed-path
selection for simulator groups, retaining a broad acceptance run. Consider
canceling obsolete validation runs only after ensuring artifact publication
cannot overwrite newer results. Measure remaining boot/queue time before buying
hardware; a persistent Mac runner is a separate capacity option.

Recent threads also report inconsistent git-object reads and a signing-hash
mismatch, followed by successful rereads/retries. Repository cleanup was already
performed. These reports deserve a separate host reliability investigation;
they do not prove a particular hardware component is faulty. Avoid treating
repeated corruption reports as ordinary AI patch mistakes or repeatedly running
expensive integrity scans without a diagnostic plan.

## Suggested first implementation

Add staged path selection plus changed-file format checks, with conservative
fallback to full validation and a broad CI job. Then split Bible stamps and add
dependency emission. Acceptance: a doc-only commit executes no program tests;
a Bible-only change does not run race/CAD; compiler/shared changes retain broad
coverage; deleted/renamed/imported inputs invalidate affected results; staged
validation remains isolated from unstaged edits.

## Follow-up: Bible WebAssembly timing

Measured the unchanged current checkout on 2026-10-21. A temporary Makefile
ran native and wasm suites separately through Make's shared `-j4` jobserver:
10 files, 128 tests, all passed. Native: 3.582 s; wasm: 8.247 s (one run each).
L8 compilation of the real web app took 18.8 ms native and 15.9 ms wasm
(median of three). Normal compilation of test_lang.l8, without test mode,
took 47.8 ms native and 43.8 ms wasm; this latter comparison is not a direct
measurement of compiling the test-mode module.

A separate instrumented run recorded 128 Node processes. Median phase times
were 1.7 ms for WebAssembly.compile, 1.3 ms for WebAssembly.instantiate and
118.6 ms from instantiation through test completion (including global/data
initialization). These are per-process wall times under concurrent execution,
not additive suite wall times. Instrumentation used a temporary NODE_OPTIONS
preload and did not change repository source.

The L8 runner builds each test root once, but starts Node separately per test
case. web/run.mjs rereads/compiles/instantiates the module on every invocation.
Data-loading guards are process-local, so tests that call load() repeatedly
read/index full datasets across cases. These costs plus execution dominate,
not L8 wasm emission. Historical slower timings also shared machine/make slots
with other suites; the exact contribution of contention was not reproduced.

A persistent Node worker per lane could cache WebAssembly.Module and create a
fresh instance per case, retaining isolated Wasm memory/globals. Smaller test
fixtures and narrower Make dependencies would address repeated data work and
unnecessary reruns. Profile individual cases before optimizing Wasm codegen.
Standalone `l8 test -j4` permits four file runners each with up to four cases;
use Make's shared jobserver for controlled comparisons against the build hook.


Follow-up: the owner also requested removal of Bible native/Wasm tests, worker
unit tests, browser/UI checks and simulator screenshot runs. Those suites and
CI jobs are removed; iOS/web artifact builds remain. Earlier measurements are
historical.

Follow-up: at the owner's request, all remaining non-compiler test suites and
Better simulator screenshot runs were removed. Compiler/CLI/C ABI, backend,
self-hosting and Wasm resume checks remain, as do application builds, benchmarks
and data-generation tools. Earlier test inventory and cost measurements are
historical.
