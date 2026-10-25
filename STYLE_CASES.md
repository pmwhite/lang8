# Temporary code-style case log

Captured against HEAD 27fdf42d, including the staged cleanup/style-guide changes.

This temporary backlog is tracked at the owner's request. Update it as cases are
addressed; consolidate or remove it during the later cleanup.
Cases are investigation/refactoring candidates, not claims that every example is a confirmed bug.
Style rules 1–24 have been approved. The application/compiler cases below remain open;
only documentation has been changed during the style-guide loop. Locations are snapshots;
use the named symbols if line numbers move. Update this log as new cases are found or resolved.

## 15. Historical and stale comments

Status: open; related style rule approved.
Location: `programs/bible/core/help.l8` — introductory comment, around lines 5–10.

Observation: The introduction mixes removed quick tips, dated owner directions, obsolete design sections and the old filename ios_help.l8.

Follow-up: Describe current responsibilities and relevant invariants; use programs/bible/ios/help.l8 as the current UI reference. Audit similar historical citations without deleting useful rationale or migration constraints.

## 16. Coherent concepts flattened into argument lists

Status: open; related style rule approved.
Location: `programs/block-game/block-game-render.l8` — draw_frame, around line 3827.

Observation: The interface has 106 parameters spanning shader bindings, mesh resources, camera, world data and animation.

Follow-up: Design meaningful interface types for concepts that share purpose/lifetime/invariants. Preserve cohesive rendering; avoid an indiscriminate context object or a mechanical argument-count limit.

## 17. Previous saved state destroyed before successful replacement

Status: open; related style rule approved.
Location: `programs/bible/tui/main.l8` — tui_write/tui_out, around lines 89–105.

Observation: O_TRUNC removes existing contents before writing, and a failed write can leave no complete saved value.

Follow-up: Define the save failure guarantee; prepare a temporary replacement, check completion and commit appropriately. Decide crash-durability requirements explicitly and coordinate with error reporting.

## 18. Toolchain workarounds outlive limitations

Status: open; related style rule approved.
Location: `programs/tree-calculus/reduce.s` — tc_copy_nodes/tc_alloc, around lines 300 and 338.

Observation: rep movsq and rep stosq use raw .byte encodings. Current src2/assembler.l8 supports rep stosq, so at least that workaround is obsolete for the current development assembler.

Follow-up: Reproduce missing mnemonic support, fix the assembler with regression coverage, and use supported mnemonics. Check bootstrap/stage compatibility before replacing encodings; do not assume every historical limitation is fixed. Recurring language friction should drive toolchain work, not application contortions.

## 19. Resource cleanup repeated across failure exits

Status: open; related style rule approved.
Location: `programs/freetype/ft.l8` — `load_cached_font`, around lines 228–248; `close_cached_font`.

Observation: Early failure returns manually release different sets of acquired FreeType resources. The inspected paths do perform cleanup; no resource leak has been established. Correctness depends on keeping acquisition and each exit's cleanup synchronized.

Follow-up: Consider an ownership/scoped-cleanup contract that handles partial acquisition and successful transfer. L8 memory regions do not substitute for releasing external resources. Any missing language mechanism needs its own design; no cleanup syntax is assumed here.

## 20. Project tooling defaults to Python and shell instead of improving L8

Status: open; related style rule approved.
Locations: `tools/profile.py`, `tools/format_src2.sh`, `programs/wayland/generate.py`, `tools/ios/assets.py`; `stdlib/` currently supplies output helpers rather than a general tool-writing library.

Observation: Routine tool logic uses Python for arguments, paths, directory traversal, subprocess capture, temporary files, hashing and structured data; shell implements iteration, comparisons and branching. These dependencies make tools convenient outside L8 while leaving the same conveniences absent inside it. Some platform integration and pre-compiler bootstrap steps may legitimately require another language.

Follow-up: Make L8 the default for project logic, including quick tools, and use real tool migrations to develop ergonomic standard-library APIs and a fast edit/run workflow. Start with a representative small tool; build reusable capabilities as required, not mechanical syscall-heavy translations. Separate host-required code and genuine bootstrap constraints from convenience-based language selection. Preserve formatter timestamp behavior, subprocess exit/error handling, output determinism and bootstrap-stage dependencies when migrating the examples.

## 21. Reusable capabilities remain buried in application-specific code

Status: open; related style rule approved.
Locations: `programs/websocket/websocket.l8` — `ws_base64`, `ws_sha1_bytes`, UTF-8 handling; `programs/bible/core/json.l8` — JSON reading and decoding; library catalog in `programs/README.md`.

Observation: General encoding, hashing and structured-data capabilities exist, but their code and visibility are tied to the application/protocol that first needed them. New L8 tools lack a discoverable, coherent collection of reusable APIs. The owner wants an expansive library collection grown boldly on demand, without requiring a single unified standard library.

Follow-up: Use actual needs to create or improve focused libraries with deliberate contracts, public/internal tags, stable import entry points, documented dependencies/platform support and a shared catalog. Do not require a second caller before recognizing a clearly reusable capability; do not build speculative frameworks. Review application assumptions before promoting existing JSON/encoding/hash implementations into reusable APIs. Keep capability libraries independently usable rather than forcing them into stdlib or an application dependency graph.

## 22. Human-facing interfaces need task-centered explanations

Status: open; related style rule approved.
Locations: `web/recipes/recipes.js` — post-run overlay around line 202 and startup catch around line 337; `web/better/better.js` — corresponding overlays around lines 384 and 778. Compiler examples: `src2/parse.l8` emits generic "unknown exception" diagnostics in several paths; `tests/compiler/unknownfn.l8` and `tests/compiler/badopen.l8` show existing location/name/type reporting to build on.

Observation: User-facing overlays say the app stopped with a numeric status or display an exception message. Those messages expose runtime outcomes without explaining the effect on the user's work, what remains available, or an appropriate next action. A restart link appears in the post-run message, but that alone does not explain consequences.

Follow-up: Treat compiler diagnostics, CLI commands, library APIs, documentation and graphical apps as UX. Design around the person's task, vocabulary, feedback and next step. Compiler errors should identify the relevant source, declaration, expectation and actual input where useful; avoid suggesting speculative or semantics-changing fixes. Apply the same task-centered contract to visible app state, preservation of work and recovery. Map technical failures into truthful, actionable explanations and preserve diagnostics for troubleshooting. Verify what is actually saved before making any reassurance. This is a proposal derived from source inspection; no live UI behavior has been tested.

## 23. Successful use depends on remembering an operation sequence

Status: open; related style rule approved.
Locations: `programs/wayland/README.md` — poll integration; `programs/wayland/wayland.l8` — `wl_window_prepare` and `wl_window_finish`; `programs/terminal/terminal.l8` — poll loop around lines 179–198.

Observation: Each successful prepare requires exactly one finish, including timeout/interruption paths, before drawing or another read/dispatch. This is a legitimate low-level integration interface, but callers must manually preserve the pairing; documentation alone carries an essential correctness obligation. No pairing bug has been established in the inspected terminal caller.

Follow-up: Design the ordinary path so correct sequencing happens naturally, through a poll-loop adapter, scoped operation, or other explicit protocol that preserves custom event-loop integration. The broader proposed principle covers productive defaults, valid construction, complete starting points, early guidance and easy recovery across APIs, compiler/tools and graphical interfaces. Keep advanced control available with explicit obligations; do not impose hidden behavior or conceal costs.

## 24. Reload-owned allocations have process lifetime

Status: open; related style rule approved. Inspected after commit 81ee39cb.
Locations: `programs/wasm/ios/host.l8` — `host_instantiate`/`host_reload`, around lines 258–320; `programs/wasm/interp.l8` — `wasm_instantiate`, around line 239; `RELOAD.md` — native-host memory limitation.

Observation: Each reload decodes and instantiates a new module, including large instance stacks and metadata. Old decoded instances remain on the native bump heap; the host defers reloads once native heap usage reaches 160 MiB and asks for a restart. Instances also acquire a native mapped memory region. The guard limits failure risk but does not reclaim obsolete instances.

Follow-up: Design ownership and reclamation around instance lifetime rather than process lifetime. Separate transfer scratch, retained persistent values, active-instance storage and native mappings; account for old callbacks/proxy bindings before reclaiming anything. Repeated reloads should have memory usage related to live state and deliberate working-set bounds. Investigate language/runtime support where the existing region/immortal model cannot express the required lifetime; do not bypass safety checks or repeat the reverted blanket-static-pool migration. This case is source/documentation evidence, not a newly measured leak rate or iOS runtime test.
