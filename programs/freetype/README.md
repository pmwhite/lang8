# FreeType fonts and atlases

Import `ft.l8` and activate `freetype`. `load_font` produces an atlas for the
fixed character range `FT_FIRST..FT_LAST`. `load_default_font` and
`load_mono_font` choose the built-in font paths. These operations release their
FreeType resources before returning a plain `Font` atlas.

`load_cached_font` instead returns an owned `CachedFont` with an on-demand atlas,
or null when the primary font cannot be prepared. Face preparation owns cleanup
until a face has opened and accepted its pixel size. The loader owns its library
until the completed font takes ownership of the library and faces. Failure to
prepare the optional fallback leaves a usable primary font.

Call `cached_font_glyph` to populate the atlas and `close_cached_font` exactly
once before discarding a successful cached font. Closing releases the fallback,
primary face and library; the font must not be used afterwards. The public atlas,
dimension and dirty fields support uploading glyphs to a renderer. The caller
owns GPU textures separately. An L8 memory region reclaims the atlas storage but
does not release the external FreeType resources.

The ABI layouts target x86-64 FreeType 2 and are checked before loading.
The native dependency is `libfreetype.so.6`.
