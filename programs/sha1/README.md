# SHA-1

Import `sha1.l8` and call `sha1::sha1_digest(data)` with a byte slice. It hashes
the complete input and returns a new 20-byte slice in network byte order. The
input is borrowed only for the call; the result belongs to the caller's
allocation region. Block scratch is reclaimed during hashing, so temporary
storage does not grow with the number of input blocks.

The SHA-1 digest of `"abc"`, in hexadecimal, is
`a9993e364706816aba3e25717850c26c9cd0d89d`. WebSocket uses this algorithm for
its version-13 handshake. SHA-1 has known collisions: use this library for
compatibility with protocols that require it, rather than new integrity or
authentication designs.

The public tag is `sha1`; state and block operations use `sha1_internal`.
There are no HTTP, WebSocket, standard-library or host-library dependencies.
Native and Wasm builds are supported.
