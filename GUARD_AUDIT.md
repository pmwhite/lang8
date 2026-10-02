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
- [x] `src2/bounds_state.l8`, `bounds_storage_new`: moved the positive-capacity
  obligation into its contract. The copied-state caller uses the four bounded
  growth steps up to 64, which the verifier can prove preserve positivity.
  The bucket-count overflow check remains because general fact storage can
  request a larger capacity.
- [x] `src2/bounds_effects.l8`, `bounds_pure_call_keeps_all` and
  `bounds_after_call`: read the state's `rows_view` and `numeric_view` rather
  than unrelated aliases through storage. Their lengths are directly covered
  by the `BoundsState` invariant, so both runtime capacity checks went away.
- [x] `src2/bounds_state.l8`, `bounds_storage`: replaced the negative-count
  check with a proved function requirement, removed the final allocation-size
  check using `bounds_storage_new`'s return guarantee, and protected capacity
  doubling against integer overflow.
- [x] `src2/bounds_state.l8`, copied prefix: split the null-state and
  existing-state paths. The existing-state function requires a count within
  `state.count` and copies from `rows_view` and `numeric_view`, whose lengths
  the record invariant proves. The unused source-links length check is gone.
  Both null-state paths share the original hinted initial-capacity choice.
- [x] `programs/terminal/scene.l8`, diff counts: removed the redundant
  `old_count/new_count > 240` check. The verifier proves the upper bound
  from the region coordinates and the retained lower-bound check.
- [x] `src2/bounds_solver.l8`, graph search cache: strengthened the cache
  invariant to establish a spare queue slot. A search contract now carries
  that queue relationship, removing two redundant queue-capacity checks and
  the duplicate queued-capacity check in the cached path.
- [x] `src2/bounds_solver.l8`, `bounds_graph_distance`: moved the target-ID
  check into a precondition. Interning and graph loading now carry a lower
  bound on the graph's node count through their contracts. Query paths pass
  the target ID through that chain, proving it remains valid after loading
  without another lookup.
- [x] `src2/bounds_solver.l8`, cache slot clearing: store pointers to occupied
  hash slots instead of integer slot positions. The verifier checks each
  pointer when the slot is occupied; clearing it needs no index check. A loop
  invariant preserves the table lengths while both arrays are reset.
- [x] `src2/bounds_solver.l8`, adjacency traversal: store pointers to edge
  records in the graph heads and links. Appending an edge proves its address
  once; searches no longer need to validate integer adjacency links.
- [x] `src2/bounds_solver.l8`, graph search source: the search now requires a
  source ID below the graph's node count. Query construction preserves the
  larger of its source and target IDs through graph loading, so both remain
  valid at the search call.
- [x] `src2/bounds_solver.l8`, cached search workspace: keep search state on
  the graph nodes whose count controls traversal. Each search resets those
  nodes; the two graphs in a join have independent work state. Cached target
  IDs flow through a search precondition, including the path translated
  through the zero node.
- [x] `src2/bounds_solver.l8`, graph search queue and edge targets: each
  graph node owns its head, current distance, and queue flag. Queue entries
  and edge targets point directly to nodes, whose addresses are checked at
  creation. Search resets node work state and no longer rechecks integer IDs
  on dequeue or edge traversal.
- [x] `src2/bounds_solver.l8`, hash slots and join sources: slots now point
  to graph nodes and are cleared through stored slot pointers on cache reuse.
  Lookups compare the term referenced by each node. Join source tables store
  node pointers, so searches and distance reads need no integer ID checks.
  The node holds a pointer to the existing term array; copying the nested
  term value into the node produced an incomplete copy with the current
  compiler.
- [x] `src2/assembler.l8`, two and three byte emitters: compose the existing
  single byte emitter, which grows the section and validates each cursor
  advance. This removes duplicate span checks over separately mutable
  section globals.
- [x] `src2/assembler.l8`, symbol hash links: store stable heap symbols in
  the growable symbol table and link buckets directly to those records.
  Lookup follows typed pointers and returns the symbol itself, so a hash
  chain never needs to revalidate an integer table index after growth.
- [x] `programs/block-game/block-game-render.l8`, grass instances: make the
  stride a constant, carry the fixed vertex and batch capacities in the cache
  invariant, and require one complete cell of room before filling. The
  verifier now combines a bounded nonnegative loop displacement with a
  length-relative base bound for both the nonnegative and upper index facts.
- [x] `programs/block-game/block-game-undo.l8`, journal head and tail: record
  `tail <= head` in the timeline invariant and store each action's absolute
  start in its trailer. Undo's return contract carries the tail bound to
  phase changes, and eviction no longer needs a redundant tail-range raise.
- [x] `programs/terminal/scene.l8`, diff window: let record arrays carry
  quantified predicates over element fields. Stored regions maintain
  `left <= right`, and the blank-trimming, prefix, and suffix loops preserve
  their lower bounds. The verifier now proves both diff widths nonnegative
  without a corruption raise.

- [x] `src2/assembler.l8`, `as_wr_le`: removed its runtime guard and
  gave the generic byte writer and fixed-width wrappers span requirements.
  Variable section emission now uses the existing byte-pair emitter, which
  owns buffer growth and cursor validation. Patch offsets are validated at
  `as_patch_i32`; ELF output checks a complete section, symbol, or relocation
  record before writing its fields. A local alias keeps the section output
  buffer's length stable across writer calls.
- [x] `src2/assembler.l8`, `as_zcopy`: replaced its span exception with a
  precondition. Both callers already own capacity checks; the string-table
  check now runs before the copy, where it also prevents a partial write.
- [x] `programs/block-game/block-game-render.l8`, grass cell count: visit the
  9 by 9 grid candidates with a bounded integer loop. Its invariant proves
  `n <= 81` without the runtime cap check. Float coordinates still advance
  one step at a time, preserving the original rounding.

## Reviewed guards still requiring validation or proof

- [ ] `programs/block-game/level.l8`, `assign_block_homes`: prove that the
  per-room counts and reconstructed home lists describe the same blocks,
  including their total fit in `RoomBlockIds.indices`.
- [x] `src2/browse.l8`, `browse_tok_start`: keep `p <= len(src)` for the
  token position. A token is a linked parser object without a source-relative
  invariant; a malformed position can make `src[p - 1]` invalid.
- [x] `src2/bounds_solver.l8`, remaining graph IDs: hash slots, join sources,
  adjacency, edge targets, and work queues now use typed node or edge
  pointers. The four remaining graph raises guard table allocation and
  signed arithmetic capacity boundaries.
- [x] `src2/bounds_solver.l8`, graph capacity: term and edge limits are
  fixed-table allocation boundaries.
- [ ] `src2/assembler.l8`, single-byte emission cursors: carry their bounds
  through the section-buffer representation. Symbol links and multi-byte
  emitters no longer need internal span checks.
- [x] `src2/assembler.l8` and `src2/elfpack.l8`, input/patch spans: keep
  validation for assembler text, relocation offsets read from patch lists,
  and final output capacity or integer overflow.
- [ ] `programs/block-game/block-game-render.l8`: prove batch copy spans from
  cache dimensions and accumulated instance counts. The current check prevents
  a partial batch copy if counts exceed capacity.
- [ ] `programs/block-game/block-game-undo.l8`: model in-memory journal words
  as valid action sizes and indices so internal reads and copies can be
  verified. Checks on archived frame data remain input validation.
- [ ] `programs/block-game/block-game-plant-render.l8`, `prepare_plants`:
  prove each computed mesh instance span fits the fixed
  `LEVEL_MAX_BLOCKS * 4` buffer. The mesh lookup still checks species and
  variant values that may originate in level data.
- [ ] `programs/terminal/scene.l8` and `programs/terminal/render.l8`: prove
  region and quad counts fit their fixed buffers. The palette fallback still
  handles values derived from terminal input.
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
  protect allocation growth against overflow. Function count and write-table
  growth are likewise bounded by the signed integer range.
- `src2/bounds_solver.l8`: remaining raises protect graph table capacity and
  arithmetic during allocation. Stored hash entries, adjacency, queue
  entries, and join sources are pointers to current graph records.
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
  buffers retain capacity checks; diff-window widths now follow from stored
  region and loop invariants.

Some remaining checks expose proof-language limits: saved journal words and
room list lengths do not have element-value or cross-object invariants. These
are internal consistency checks, not user-facing errors.
Their `IndexOutOfBounds` raises remain proof work: removing them safely
requires changing the representations or adding proofs that survive mutation
and reuse.

The assembler now reports an addressable-section limit through its `l8as`
diagnostic path. Compiler input that overflows an import path or variant name
reports a source `Error`. Bounds-analysis function, graph, and fact-table
allocation limits also report source `Error`. The call contracts no longer
advertise `IndexOutOfBounds` along paths that only reach those limits.
The compiler string buffer now maintains a nonnegative used length. Both
single-byte and bulk append report source `Error` if their target length
overflows; bulk append previously lacked that overflow check.
