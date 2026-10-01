# Guard audit after checked indexing removal

This is a working inventory of bounds-related branches introduced or exposed while
removing `![]`. `src1` mirrors `src2`; compiler entries refer to `src2` unless
noted. A branch belongs on this list when its main purpose appears to be
supplying a proof for `[]` or a bulk copy. An entry is a candidate, not a claim
that the branch is safe to delete. Check the producer, caller, and overflow
behavior before changing it. Keep checks on input and I/O boundaries.

## Removed

- [x] `programs/block-game/level.l8`, `load_grid_src`: removed
  `len(bricks) < 0`, an impossible condition. It was the only use of the
  `bricks` parameter, so the parameter and call argument went too.
- [x] `src2/browse.l8`, `browse_tok_end`: removed three duplicate
  `at/j < len(src)` conditions. The function now requires the
  `src_len < len(src)` relationship already guaranteed by `ImportedFile`.
  The token-position checks remain because they protect the actual index.

## Internal proof candidates

- [ ] `src2/browse.l8`, `browse_tok_start`: the `p <= len(src)` check
  accompanies a lexer token position. Investigate whether a verified token
  invariant or tokenizer return contract can establish it. Do not drop it
  without proving the token position.
- [ ] `src2/bounds_state.l8`, `bounds_storage`: the negative-count,
  copied-prefix capacity, and final capacity checks around row copying may
  belong in a stronger `BoundsState`/`BoundsStorage` invariant and a count
  contract. Account for integer overflow in capacity doubling.
- [ ] `src2/bounds_state.l8`, `bounds_numeric_at` and
  `bounds_numeric_ref`: the `storage != null` branch looks redundant with
  `state.count <= len(state.numeric_view)`. Check whether a null storage can
  validly have a nonempty view before simplifying.
- [ ] `src2/bounds_effects.l8`, `bounds_pure_call_keeps_all` and
  `bounds_after_call`: both test `f.count` against the storage row and
  numeric capacities. A state invariant currently covers its views but does
  not directly relate those views to `storage`.
- [ ] `src2/bounds_solver.l8`, graph intern/search/cache functions:
  repeated node, slot, queue, and distance capacity checks may be derivable
  from graph and cache invariants. Verify that graph growth cannot exceed
  the allocated term and edge tables.
- [ ] `src2/assembler.l8` and `src2/elfpack.l8`: byte-copy and text-buffer
  span checks use runtime `IndexOutOfBounds` branches in internal emitters.
  Move proved cursor/capacity relationships into helper contracts where the
  producer establishes them; retain overflow or allocation failure checks.
- [ ] `programs/block-game/block-game-render.l8`: cell batch and vertex
  span guards should be reviewed against allocated batch capacities and
  producer counts. Some limit checks are real saturation behavior.
- [ ] `programs/block-game/block-game-undo.l8`: journal and image span
  checks mix internal proof scaffolding with validation of archived frames.
  Separate those cases before changing any branch.
- [ ] `programs/block-game/block-game-plant-render.l8`,
  `prepare_plants`: mesh range checks and the `p.data` span check may be
  expressible through validated plant shape, block count, and render-buffer
  invariants. A negative shape alone does not establish a valid species.
- [ ] `programs/terminal/scene.l8` and `programs/terminal/render.l8`:
  region, palette, glyph, and vertex offset checks are candidates where
  positions come from internal layout calculations. Keep checks for decoded
  escape sequences or external font data.
- [ ] `programs/freetype/ft.l8`: glyph-cache and hash-table bounds checks
  may be replaced by cache invariants, but library results and Unicode input
  remain validation boundaries.

## Boundary checks to retain unless their input contract changes

- `programs/http`, `programs/websocket`, and `stdlib/raw_write.l8` validate
  network or syscall data, counts, and slices.
- `programs/block-game/level.l8` validates text save files, archived
  frames, user-selected rooms, and external resource counts.
- `src2/compiler.l8` and `src2/parse.l8` validate user source spans and
  imported files before parsing or copying.

The scan covered bounds-related guards in compiler, standard library, and
program sources plus the commits that removed checked indexing. It groups
repeated patterns rather than listing every individual guard.
