# Temporary code-style case log

Captured against HEAD 27fdf42d, including the staged cleanup/style-guide changes.

This temporary backlog is tracked at the owner's request. Update it as cases are
addressed; consolidate or remove it during the later cleanup.
Cases are investigation/refactoring candidates, not claims that every example is a confirmed bug.
Style rules 1–24 have been approved. The application/compiler cases below remain open;
only documentation has been changed during the style-guide loop. Locations are snapshots;
use the named symbols if line numbers move. Update this log as new cases are found or resolved.

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
