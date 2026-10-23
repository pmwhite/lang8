# Static allocation migration

L8 is moving toward explicitly bounded storage. This is an incremental language
and whole-repository migration; `new` and `region` still work during it.
Existing programs and the compiler must keep building at every step.

## Target contract

Program-owned storage has a capacity known before execution: global fixed arrays,
fixed-size function locals, caller-owned output buffers, and typed fixed-capacity
containers. Input size changes how much storage is used, not its capacity.
There is no general heap allocator in the completed static profile.
Selecting a slot in a declared array is allowed; hiding `new` behind a fixed-size
arena is not completion of this migration.

Function locals remain allowed; retained references must point to storage that
remains live. Lifetime analysis has been removed from source-built compilers. Fixed frames alone do not bound total stack use: recursion, reentrancy,
thread count, and host callbacks need explicit bounds before claiming a whole
program memory bound. Imported platform libraries and browser/native hosts have
their own allocations; those must be identified separately, not silently counted
as static. The saved bootstrap is a migration dependency until promotion.

Each bounded container declares its capacity and exhaustion behavior. Check
capacity before modifying state and return a documented error, or terminate
explicitly where that is the chosen contract. Never truncate input silently.
Prefer indices for stored graph edges; reused slots need validated handles
(e.g. index plus generation) or a lifetime discipline. Fixed arrays do not by
themselves make stale references safe. Legacy lifetime annotations are inert;
see [memory.md](memory.md) for the transitional storage contract.

## Implemented storage interfaces

These are accepted by both source compiler stages. The saved bootstrap has not
been promoted and does not yet understand the new source syntax.

```l8
const CAPACITY: int = 4096;

// Counted storage with a fixed global backing array; initialize once.
text: []i8 = static_buffer(CAPACITY, 0i8);
labels: []str = static_buffer(16, "");

// Slice literals directly initializing globals now have static backing too.
names: []str = ["first", "second"];

work(): int {
    // One counted backing array per expression per function invocation.
    scratch: []i8 = buffer([1024]i8);
    words: []int = buffer(32, -1);
    // An inline value, rather than a counted view.
    values: [16]int = zeroed([16]int);
    len(scratch) + words[0] + values[0]
}
```

`buffer` storage lasts for the call. Retaining it through a return value, heap
object, or global produces an expired reference after return; the compiler no
longer rejects this. Re-evaluating the same expression in a loop resets and
reuses its slot; it does not create a fresh object. Separate recursive calls
have separate frames. `static_buffer` must directly initialize a global slice.
Both accept a fixed-array type with an optional fill, or a compile-time integer
capacity and a fill value. A fill is evaluated once. Capacities must be positive
and backing data must fit within 512 MiB; multiplication is checked. The type-only
form and `zeroed` require values for which all-zero bytes are valid. Required
references, strings, refinements and tagged unions need explicit initialization.
Zero-capacity legacy slices remain to be migrated.

The stage-2 backends construct exception payloads in a frame and publish them
through a fixed transfer slot sized for the program's largest exception. Catch
binders copy the value before handler code runs. Repeated raises no longer consume
the heap. Native and Wasm compiler fixtures cover nested construction and catches.
The stage-1 exception backend and saved bootstrap remain legacy dependencies.

The stage-2 compiler's own tokens, AST nodes, and byte buffers come from fixed
pools in `src2/storage.l8`. Those pools reset at the start of each compilation.
Byte buffers use size classes up to 64 MiB. Growth takes one slot for a whole
class, and source files start in a small class instead of a 512 KiB slot.
Darwin zero-fill is `__DATA,__bss`: the assembler counts it, and the Mach-O
image is allocated already zeroed. Data that must stay live across a pool
reset, including the test report and diagnostic path prefix, has its own
static storage. A pointer into a pool does not survive that reset.

## Enforcing static programs

`compile`, `build`, `wasm`, and `arm64` accept `--static`. The typed gate examines
global initializers and all non-test functions in the import graph, including
unused functions. It rejects heap construction, allocating local slice literals,
copying string conversions and regions. Foreign declarations must use an audited
runtime boundary; unknown foreign functions and shared libraries remain blockers.
This is a conservative source and runtime contract, not verification of arbitrary
assembly, operating-system services, or JavaScript/native host internals.

On x86-64 and arm64 Linux, static builds use `__l8_static_start` and bypass the
legacy heap mapping and argv copies. `main` currently must take no parameters
and return `int`. The built-in ELF packers select this entry automatically;
external ELF linkers must select it explicitly (for GNU ld,
`-e __l8_static_start`). A static Wasm module fixes its memory maximum at its
initial size and its `l8_malloc` export returns failure. Its parameterless entry
does not request host-built argument strings. iOS/Android startup and bounded
argument/environment storage have not yet been migrated; `--static` rejects those
platforms. Default compilation still supports existing programs during migration.

A native syscall trace of a static buffer/I/O/exception smoke program performed
no `mmap` or `brk`. A Wasm host smoke check verified fixed memory, allocator
failure, and no argument request. This certifies those exercised paths; it does
not certify any of the remaining legacy applications or compiler entry points.

## Measuring progress now

Run from the checkout root:

```
make allocation-report
python3 tools/static_allocation.py --details
make allocation-check
```

The inventory counts explicit `new` expressions, `region` blocks, and `bytes()` /
`cstr()` call syntax per file. It skips comments, strings, character literals,
expectation text, and `@new` lifetime contracts. Reports separate `src1`, `src2`,
`stdlib`, each application, and fixtures. The first inventory had 4,165 explicit
`new` sites. The current migration checkpoint has 1,543 (2,622 removed), including
bootstrap and fixtures. Standard output uses a fixed integer buffer and read-only
text spans without heap copies.

`make check` runs the per-file ratchet. A count cannot exceed its checked-in
baseline, including in a new file. Removing allocations does not buy permission
to add them elsewhere. After a reviewed migration, run:

```
python3 tools/static_allocation.py --update
git diff -- tools/static-allocation-baseline.json
```

Commit the reductions with the migration so they become the next ceiling.
Renaming a file or adding a compiler allocation fixture can require a reviewed
baseline adjustment. Do not regenerate it just to silence an unexpected increase.
The baseline is a ceiling, not a frozen initial measurement or percentage score.

These are source-site counts, **not an allocation analysis**. Local slice literals,
implicit string conversions, legacy exception storage, arguments,
compiler-generated temporaries, native assembly, foreign calls, and host reload
code need semantic/runtime audits. Calls can be counted in unreachable code;
the inventory does not resolve names or import graphs. Zero counts do not certify
a module. Do not replace obvious `new` expressions with hidden allocations to
improve the score. Tests and bootstrap counts are shown for visibility and must
not be included in application-completion claims.

## Buildable milestones

1. **Inventory and first reduction (started here).** Keep a per-file ceiling in
   `make check`, document the storage contract, and convert integer output to
   inline storage. Validate native self-hosting because both stages import the
   standard library. Application suites remain removed.
2. **Compiler-enforced static profile (initial implementation available).** Expand
   the opt-in mode to the remaining runtimes and host interfaces. It checks the
   complete typed import graph, including implicit allocation paths and global
   initializers. Report the source allocation and call path. Reject unclassified
   foreign allocation paths in this profile. Keep default mode working for
   unmigrated code. Add compiler acceptance/rejection fixtures on native and Wasm.
   The acceptance gate is stronger than the inventory and becomes the completion
   criterion for each migrated entry point.
3. **Bounded library interfaces.** Add caller-buffer operations and read-only
   spans, then migrate strings, formatting and I/O. `write_int` now has no heap
   buffer; `write(text)` uses the read-only native span boundary. Counted
   `buffer` storage bridges existing slice APIs without a heap. The language
   still forbids taking a mutable pointer to string bytes.
   Specify termination, output length, aliasing, exhaustion, and lifetimes for
   string builders before changing callers. No shared global scratch buffers
   that break callbacks or reentrancy.
4. **First complete application.** Choose a small entry point and document all
   capacities in its README. Convert its entire import graph, including file
   reading and startup interfaces; enable the static profile permanently for
   that build target. Build native and Wasm when supported. Count certified
   entry points as well as remaining allocation sites. Check capacity boundaries
   through compiler fixtures or focused manual runs; do not recreate app suites.
5. **Application waves.** Migrate small tools, then graph-heavy applications,
   then frame-based applications and Bible/platform hosts in separate slices.
   Every slice names the build targets verified, capacity limits, exhaustion
   policy and outstanding host dependencies. Review persistent data and reload
   migration explicitly; fixed storage does not remove the need to translate
   pointers and changed layouts across builds.
6. **Self-hosted compiler.** Replace input buffers, tokens, AST/IR nodes, symbol
   tables, encoders and output builders one subsystem at a time with typed,
   declared capacities. Exercise the compiler's own sources and report limits
   for larger inputs. Keep src1 accepted by the saved bootstrap. Implement any
   required language support using BOOTSTRAP.md's stage procedure; do not copy
   new syntax into src1 prematurely. Require `make -j4 selfhost compiler-test`
   and native/Wasm fixpoints for affected backends before promotion.
7. **Make static the default and retire the heap.** Only after every supported
   entry point passes the semantic gate, remove legacy allocation APIs and
   region-specific machinery, migrate old fixtures into relevant rejection
   coverage, and promote a static bootstrap. Audit all runtimes, startup,
   exceptions, reload, stack bounds and host boundaries. Verify normal native,
   arm64, iOS assembly/simulator, web and Wasm build targets as applicable.

A slice is finished when its focused builds pass, the corresponding inventory
ceilings are reduced, and any capacity/behavior changes are documented. A module
is finished when the compiler's static gate accepts its import graph. The whole
migration is finished only when supported programs and the self-hosting compiler
meet the target contract, not when the source inventory happens to reach zero.
