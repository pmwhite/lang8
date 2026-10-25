# Temporary code-style case log

Captured against HEAD 27fdf42d, including the staged cleanup/style-guide changes.

This temporary backlog is tracked at the owner's request. Update it as cases are
addressed; consolidate or remove it during the later cleanup.
Cases are investigation/refactoring candidates, not claims that every example is a confirmed bug.
Style rules 1–24 have been approved. The application/compiler cases below remain open;
only documentation has been changed during the style-guide loop. Locations are snapshots;
use the named symbols if line numbers move. Update this log as new cases are found or resolved.

## 24. Reload-owned allocations have process lifetime

Status: open; related style rule approved. Inspected after commit 81ee39cb.
Locations: `programs/wasm/ios/host.l8` — `host_instantiate`/`host_reload`, around lines 258–320; `programs/wasm/interp.l8` — `wasm_instantiate`, around line 239; `RELOAD.md` — native-host memory limitation.

Observation: Each reload decodes and instantiates a new module, including large instance stacks and metadata. Old decoded instances remain on the native bump heap; the host defers reloads once native heap usage reaches 160 MiB and asks for a restart. Instances also acquire a native mapped memory region. The guard limits failure risk but does not reclaim obsolete instances.

Follow-up: Design ownership and reclamation around instance lifetime rather than process lifetime. Separate transfer scratch, retained persistent values, active-instance storage and native mappings; account for old callbacks/proxy bindings before reclaiming anything. Repeated reloads should have memory usage related to live state and deliberate working-set bounds. Investigate language/runtime support where the existing region/immortal model cannot express the required lifetime; do not bypass safety checks or repeat the reverted blanket-static-pool migration. This case is source/documentation evidence, not a newly measured leak rate or iOS runtime test.
