# DEFLATE

Import `deflate.l8` and use the `deflate` tag. It decodes DEFLATE data
(RFC 1951) and its zlib (RFC 1950) and gzip (RFC 1952) containers, and
computes the CRC-32 and Adler-32 checksums they use. Native and Wasm builds
are supported; there are no other dependencies.

```l8
text: []i8 = gzip_decompress(file, 0, file_size);
block: []i8 = zlib_decompress(data, offset, compressed_size, uncompressed_size);
raw: []i8 = inflate(data, offset, compressed_size, -1);
```

Each decoder reads `count` bytes of `source` from `start` and returns a new
slice of exactly the decoded size, in the caller's allocation region. The
span must hold the whole stream and nothing after it: bytes after the final
block are `TrailingData`. `expected_size` is the decoded size when the
caller knows it (zip entries, SWORD block indexes); a different size fails
with `SizeMismatch`. With `-1` the stream is decoded twice, first through a
32 KiB window only to measure it, so memory stays at the result's size.
`gzip_decompress` takes the size from the member's trailer; one claiming more
than the stream could make (1032 bytes for each of its bytes) is
`SizeMismatch`, found before anything is allocated.
`zlib_decompress_leading` decodes the zlib stream at the start of its span
and leaves any bytes after the stream's checksum unread: some formats pad
their streams (SWORD's compressed blocks), and a span that ends before the
checksum is `Truncated`.

zlib streams are checked against their Adler-32 and gzip members against
their CRC-32 and size; a gzip header's optional extra field, name, comment
and header CRC are read and checked. zlib preset dictionaries are not
supported (`BadHeader`). A gzip file must be one member: several members
fail with `TrailingData`. Members of 4 GiB or more are not supported, since
the trailer holds the size modulo 2^32.

Failures raise `DeflateError { failure, at }`: a `DeflateFailure` variant and
the source byte offset near which it was found. `deflate_failure_name`
describes the variant. Nothing is returned on failure.

`crc32(data, start, count)` and `adler32(data, start, count)` return
checksums from 0 to 2^32 - 1; `crc32_update(crc, data, start, count)`
continues a CRC over another span (start from 0).

Huffman codes of up to 10 bits decode with one table lookup. Natively and
under Node's Wasm, the KJV's text (4.6 MB, `gzip -9`) inflates at about
125 MB/s; with gzip's CRC-32 check, about 80 MB/s.
`deflate_test.l8` holds the contract's examples: `l8 test
programs/deflate/deflate_test.l8`.
