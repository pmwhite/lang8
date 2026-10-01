# Guard audit after checked indexing removal

This inventory covers the bounds-related branches found while removing `![]` in
the compiler, standard library, and programs. `src1` mirrors `src2`; compiler
entries refer to `src2`. A completed entry records either a proof that replaced
a guard or a reason to keep the guard. It does not imply that every runtime
bounds check in the tree should disappear: checks at input, allocation, and
fixed-capacity boundaries prevent real failures.

## Removed or replaced with proofs

- [x] `programs/block-game/level.l8`, `load_grid_src`: removed the impossible
  `len(bricks) < 0` branch and its otherwise unused argument.
- [x] `src2/browse.l8`, `browse_tok_end`: removed three repeated
  `at/j < len(src)` checks. A function contract carries the `ImportedFile`
  relationship `src_len < len(src)`; the token-position checks remain.
- [x] `src2/bounds_state.l8`, `bounds_numeric_at` and `bounds_numeric_ref`:
  removed `storage != null` from view lookups. The record's direct invariant
  already gives `count <= len(numeric_view)`, which is the actual array read.
- [x] `src2/bounds_state.l8`, `bounds_direct_evidence`: removed the
  `count > len(storage.numeric)` exception. The lookup now reads
  `state.numeric_view`, whose length is covered by the `BoundsState` record
  invariant. Hash buckets still come from storage.
- [x] `src2/bounds_effects.l8`, `bounds_pure_call_keeps_all` and
  `bounds_after_call`: read the state's `rows_view` and `numeric_view` rather
  than unrelated aliases through storage. Their lengths are directly covered
  by the `BoundsState` invariant, so both runtime capacity checks went away.
- [x] `src2/bounds_state.l8`, `bounds_storage`: replaced the negative-count
  check with a proved function requirement, removed the final allocation-size
  check using `bounds_storage_new`'s return guarantee, and protected capacity
  doubling against integer overflow.
- [x] `programs/terminal/scene.l8`, diff counts: removed the redundant
  `old_count/new_count > 240` check. The verifier proves the upper bound
  from the region coordinates and the retained lower-bound check.
- [x] `src2/bounds_solver.l8`, graph search cache: strengthened the cache
  invariant to establish a spare queue slot. A search contract now carries
  that queue relationship, removing two redundant queue-capacity checks and
  the duplicate queued-capacity check in the cached path.

- [x] `src2/assembler.l8`, `as_wr_le`: removed its runtime guard and
  gave the generic byte writer and fixed-width wrappers span requirements.
  Variable section emission now uses the existing byte-pair emitter, which
  owns buffer growth and cursor validation. Patch offsets are validated at
  `as_patch_i32`; ELF output checks a complete section, symbol, or relocation
  record before writing its fields. A local alias keeps the section output
  buffer's length stable across writer calls.

## Reviewed guards retained for real failure cases

- [x] `src2/browse.l8`, `browse_tok_start`: keep `p <= len(src)` for the
  token position. A token is a linked parser object without a source-relative
  invariant; a malformed position can make `src[p - 1]` invalid.
- [x] `src2/bounds_state.l8`, `bounds_storage` copied-prefix check: keep the
  source/destination capacity check when copying an arena-reused fact buffer.
  `BoundsState` guarantees its direct views, but its separately mutable
  `storage` reference is not tied to those views by the type system. A nested
  record invariant would be unsound without tracking writes through aliases.
- [x] `src2/bounds_solver.l8`, remaining graph IDs and capacities: keep the
  checks on IDs read from hash slots, adjacency links, and work queues. Their
  contents can be stale across graph reloads; array-length invariants alone
  do not establish valid element values. Term and edge capacity limits are
  also genuine fixed-table limits.
- [x] `src2/assembler.l8` and `src2/elfpack.l8`, input/patch and
  section-buffer checks: keep validation for assembler text, relocation
  offsets read from patch lists, and cursor overflow. In `as_emit_b2/b3`, a
  returned buffer from `as_ensure_cap` alone does not yet prove the
  `n + 1`/`n + 2` accesses.
- [x] `programs/block-game/block-game-render.l8`: keep the grass-cell cap,
  complete-instance span, and copy-span checks. They prevent an overfull
  fixed batch or a partial vertex write if produced counts exceed capacity.
- [x] `programs/block-game/block-game-undo.l8`: keep ring-journal and image
  span checks. Journal words are read back as sizes and indices; validation
  prevents corrupt actions and archived frames from driving an invalid copy.
- [x] `programs/block-game/block-game-plant-render.l8`, `prepare_plants`:
  keep mesh and instance-span checks. `plant_block` means only that shape is
  negative; it does not prove a valid species and variant. The data buffer is
  fixed at `LEVEL_MAX_BLOCKS * 4` floats.
- [x] `programs/terminal/scene.l8` and `programs/terminal/render.l8`:
  keep scene-region capacity, the diff-window lower bound, full-quad span,
  and palette fallback checks. These enforce fixed table limits or handle colors decoded
  from terminal input.
- [x] `programs/freetype/ft.l8`: keep the glyph-capacity and hash-size
  checks. The glyph table fills with distinct code points and FreeType
  supplies glyph dimensions; neither is bounded by a verifier fact about a
  particular array index.

## Other input boundaries

- `programs/http`, `programs/websocket`, and `stdlib/raw_write.l8` validate
  network or syscall data, counts, and slices.
- `programs/block-game/level.l8` validates text save files, archived
  frames, user-selected rooms, and external resource counts.
- `src2/compiler.l8` and `src2/parse.l8` validate user source spans and
  imported files before parsing or copying.

This is grouped by proof pattern rather than one entry per line. The review
also checked the commits that removed checked indexing.

## Explicit exception audit

Reviewed every explicit `raise` in `src2`, `stdlib`, and `programs` (excluding
the mirrored `src1` compiler and tests). The remaining sites have these roles:

- `src2/compiler.l8` and `src2/tags.l8`: source errors are diagnostics for
  invalid user programs. The other compiler raises protect path and name
  lengths from integer overflow before allocation or copying.
- `src2/bounds_state.l8` and `src2/bounds_effects.l8`: remaining raises
  protect allocation growth and copied arena storage against overflow or
  mismatched capacities. Function count and write-table growth are likewise
  bounded by the signed integer range.
- `src2/bounds_solver.l8`: graph capacity and IDs read from mutable slots,
  adjacency, and cached workspaces are checked before access. The IDs are
  stored as integers, so array and graph size invariants do not prove their
  contents valid after graph reuse.
- `src2/assembler.l8` and `src2/elfpack.l8`: assembler cursors, symbol links,
  relocation offsets, string-table spans, and ELF output spans are validated
  at their respective capacity or patch boundaries.
- `stdlib/write.l8`: `InvalidRange` reports caller-supplied spans; `IoError`
  reports syscall results and zero-progress writes.
- `programs/block-game/level.l8` and `block-game-undo.l8`: room totals,
  journal lengths, archived frame spans, and rewind metadata are checked when
  reconstructed from mutable or saved state.
- `programs/block-game/block-game-render.l8` and
  `block-game-plant-render.l8`: fixed instance buffers and batch copy spans
  are checked before a complete record is written.
- `programs/terminal/scene.l8` and `render.l8`: fixed region and vertex
  buffers and diff-window lengths are checked at their capacity boundaries.

Some remaining checks also expose proof-language limits: graph slot values,
saved journal words, and room list lengths do not have element-value or
cross-object invariants. Removing those checks safely would require changing
the representations or adding proofs that survive mutation and reuse.
