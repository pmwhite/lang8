# Base64

Import `base64.l8` and call `base64::base64_encode(data)` with a byte slice.
It returns a newly allocated `str` containing RFC 4648 standard Base64, with
`=` padding and no line breaks. Empty input produces an empty string; binary
input, including zero bytes, is supported. The input is borrowed only for the
call and the result belongs to the caller's allocation region.

For example, `base64_encode(bytes("foo"))` produces `"Zm9v"` and
`base64_encode(bytes("f"))` produces `"Zg=="`.

The public tag is `base64`; implementation declarations use `base64_internal`.
This is an encoder, with no decoding or URL-safe alphabet API. It uses ordinary
L8 allocations, no host libraries, and supports native and Wasm builds.
