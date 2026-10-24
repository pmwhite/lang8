# WebSocket

This directory implements the RFC 6455 version 13 handshake and framing over
the HTTP library. It supports text and binary messages, fragmentation,
client-side masking, ping/pong, close handshakes, protocol limits, and UTF-8
validation. It does not negotiate extensions or subprotocols.

Clients activate `websocket`; servers also activate `http` to read and inspect
the upgrade request. Both import `websocket.l8`. The WebSocket public surface is
`WsConnection`, `WsMessage`, the three message-kind constants,
`ws_client`, `ws_accept`, `ws_read`, `ws_send`, `ws_send_text`,
`ws_send_binary`, `ws_close`, and `ws_connection_close`. Handshake hashing,
base64, frame parsing, masking, and buffers remain under `websocket_internal`.

`ws_read` returns one complete, reassembled application message or `WS_CLOSE`.
An `error` of zero means success; otherwise it contains the close code used for
the failure. Message bytes remain valid until the next `ws_read` on that
connection. Each message is limited to 16 MiB and 1,024 frames.

The server application reads the HTTP request before calling `ws_accept`, so it
can enforce a target, Origin allowlist, cookies, or authorization policy first.
The client accepts numeric IPv4/IPv6 addresses and `localhost`, matching the
HTTP transport. TLS (`wss`) is outside this library.

From the repository root:

```sh
make websocket
.build/websocket/server 8081
.build/websocket/client 127.0.0.1 8081 / hello
```

Protocol reference: [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html).

Connections reserve one of eight process-local static slots. Each owns a
16 MiB reassembly buffer, a separate 16 MiB incoming-frame buffer, and its
state/message records. Message views expire on the next read or connection
close. Closing returns the slot; its connection pointer must not be used again.
Exhaustion terminates with the HTTP storage diagnostic. Calls on a connection
must be serialized. Outgoing client masking uses a 4 KiB call-local buffer.

Handshake work uses an HTTP checkpoint and returns its temporary storage before
returning. A server's input request remains owned by its caller, who can rewind
its transaction checkpoint after accepting/rejecting the upgrade. Reads and
sends reuse connection/call storage without consuming HTTP transaction slots.
