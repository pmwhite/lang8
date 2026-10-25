# UTF-8 validation

Import `utf8.l8` and call `utf8::utf8_valid_prefix(data, byte_count)`. It checks
exactly that prefix for complete Unicode scalar values encoded in UTF-8.
An empty prefix is valid. Negative counts or counts beyond the slice return
false without reading the input. Bytes beyond the prefix do not participate.

The validator rejects truncated sequences, overlong encodings, surrogate code
points, values beyond U+10FFFF, and misplaced continuation bytes. It accepts
zero bytes and Unicode noncharacters; application rules about text content
belong to the caller. It does not normalize or replace text, retain the input,
or allocate memory.

The public tag is `utf8`; implementation declarations use `utf8_internal`.
It has no imports or host dependencies and supports native and Wasm builds.
