# FreeType storage

`ft.l8` keeps L8-owned font data in eight static ownership slots. Each reserves
an atlas of up to 2048×2048 bytes, 4,096 glyphs and 8,192 lookup entries.
`load_cached_font` returns null for unsupported dimensions, capacity, or full
storage. `close_cached_font` releases its native faces/library and returns its
slot. `load_font` returns an unsuccessful `Font` on exhaustion; `release_font`
returns a successful value's slot after its atlas and glyphs are no longer used.
A released font and copies of its views must no longer be used.

Glyph bitmap copies use 64 KiB frame scratch. Oversized cached glyphs use the
missing glyph; oversized glyphs make a whole-font load unsuccessful. Saturated
lookup tables stop probing and render without caching another alias.

FreeType itself remains a native library that manages its own allocations.
The L8 backing arrays, glyph copies and font records do not use the L8 heap.
