# L8 HTTP/1.1

An HTTP/1.1 origin-server and client library written in L8. Import `http.l8`.
The parser, serializer, chunk decoder, conditional-request evaluator, and range
implementation are L8 code. Only sockets, DNS, clocks, calendar conversion, and
process management use libc. The build and test commands build a tag-aware
stage-1 compiler using the checked-in `bootstrap`, without a C compiler or
third-party HTTP package, on x86-64 Linux with glibc. Library declarations carry
the `http` tag; callers activate it with `use_tag http;`.

The selected protocol scope is **HTTP/1.1 over TCP**, with HTTP/1.0 compatibility.
The reference set includes RFC 9110, RFC 9112, their verified-errata snapshots,
and the March 2026 RFC 9931 CONNECT security update. Original documents,
source URLs, and SHA-256 hashes are in [spec/](spec/). The
[conformance matrix](CONFORMANCE.md) maps implemented behavior to executable
tests and explicitly identifies optional and application-owned behavior.
This is a tested implementation, not a claim that finite tests prove every
requirement in the entire HTTP family.

## Build and run

From the repository root:

```sh
./build.sh http
./build.sh http-test
.build/http/server 8080 127.0.0.1
# In another terminal:
.build/http/client 127.0.0.1 8080 /
.build/http/client 127.0.0.1 8080 / POST 'hello' expect
.build/http/client 127.0.0.1 8080 / POST 'hello' chunked
```

The server arguments are `PORT [BIND_ADDRESS [TIMEOUT_MS]]`, defaulting to
`8080 127.0.0.1 10000`. Use `::1` for IPv6 loopback. It prints `ready` after
listening. It uses up to 64 processes for concurrent connections; the parent
reaps finished workers when accepting connections. Each connection handles
up to 1,000 ordered requests and advertises closure on the final response.
Per-request regions reclaim allocations before the next request.

The example application returns a greeting for GET/HEAD, echoes binary POST/PUT
content, and answers OPTIONS/DELETE. `/chunked` selects a chunked response with
an `X-Complete` trailer. GET/HEAD support validators and GET supports ranges.
Other methods, including CONNECT and TRACE, receive 501. The example is an
in-memory demonstration; PUT/DELETE do not persist resources.

The client arguments are `HOST PORT TARGET [METHOD [BODY [expect|chunked]]]`.
It prints response content, exits 22 for HTTP errors, 1 for protocol/transport
failure, and 2 for invalid invocation. BODY arguments are strings; binary bodies
are supported by the library. It does not follow redirects automatically.

`L8C=/absolute/path/to/compiler ./build.sh http-test` selects another L8 compiler.
`BUILD=/path/to/artifacts` changes the build-script output directory. Tests
require Python 3.11+ and its standard library, run exclusively against local
loopback peers, and need no network downloads. Test helpers rebuild once per run.

```sh
python3 programs/http/spec/fetch.py --check     # offline hash verification
python3 programs/http/spec/fetch.py --download  # retrieve exact pinned documents
```

## Messages and ownership

`HttpMessage` has `method`, `target`, `authority`, `minor`, `status`, `reason`,
`headers[0..count]`, `trailers[0..trailer_count]`, `body`, `framing`, `length`,
`close`, `expect`, and `error`. A body is a mutable byte buffer: use only
`body.data[0..body.size]`. It can contain every octet, including NUL.
`str` is used only for validated, NUL-free protocol text.

Field names are normalized to lowercase. Values are trimmed only at their
outer optional whitespace. Duplicate fields retain their order and remain
separate; notably, `Set-Cookie` is never comma-joined. `http_get` returns the
first occurrence; iterate the array for all values. `http_has` distinguishes a
missing field from an empty one. Parsed trailers are never merged into headers.

A parsed request's `target` is its path and query, `*`, or CONNECT authority.
For absolute-form requests, `authority` comes from the request-target, taking
precedence over Host. Percent escapes are validated and preserved, not decoded.
There is no filesystem path interpretation.

Every constructor returns `@new` storage. Allocate each transaction in an L8
`region`; consume its response inside that region. Keep `HttpReader`/`HttpClient`
outside the transaction region to retain connection input buffers. The client
contains no pointers into previously completed requests or responses.

`error == 0` means successful processing. Positive errors use descriptive HTTP
status numbers (400 malformed/incomplete, 408 deadline, 413 body limit,
414 start-line limit, 417 unsupported expectation, 431 fields limit,
501 unsupported transfer coding, 505 unsupported major version).
`error == -1` is EOF between messages. A client-side error is a local error,
not a fabricated response status. Never use partial content as a successful
response after an error; close the connection. Socket constructors return -1
or null on connection/setup failure.

## Buffered client

```l8
tag application;
import "http.l8";
use_tag http;

main(): int {
    optional: ?*HttpClient = http_client("127.0.0.1", "8080");
    if (optional == null) { return 1; }
    client: *HttpClient = optional;
    region {
        request: *HttpMessage = http_request("POST", "/", "127.0.0.1:8080");
        http_text(request.body, "hello");
        response: *HttpMessage = http_exchange(client, request);
        if (response.error == 0) { write(1, response.body.data, response.body.size); }
    }
    http_client_close(client);
    0;
}
```

`http_exchange` supports sequential reuse, informational responses, chunking,
trailers, fixed-length and EOF-delimited responses, and a one-second
100-continue fallback. During uploads it polls both directions, prioritizes
incoming responses, and sends at most 16 KiB per write attempt. A final response
stops the upload and half-closes the write side before reading the response body;
an incomplete request always makes the connection non-reusable, even if the
response advertises keep-alive. Informational responses do not restart or abort
an upload. One absolute transaction deadline also bounds partial response heads.
It never retries or pipelines requests implicitly. `client.reusable` becomes false on closure, a protocol
error, or a protocol transition. Closing is idempotent at the client level.

Successful CONNECT or a solicited 101 response returns `framing == 4` and leaves
the socket open. Consume already-buffered tunnel bytes through the same reader
before switching to raw socket operations. A CONNECT request cannot carry a
body through this API, and no tunnel bytes are sent before confirmation.
The library performs the HTTP handshake only; it does not implement a proxy,
WebSocket, TLS, or the selected successor protocol.

## Server and streaming APIs

- `http_listen(host, port)`, `http_accept(listener)`, `http_reader(fd, true)`
  establish a connection. `http_close(reader)` half-closes, briefly drains
  in-flight data, and closes the descriptor; call it once per reader.
- `http_receive_request(reader)` reads a complete request and sends 100 Continue
  when applicable. Use `http_read_head(reader, false, "")` directly when the
  application needs to authorize or reject a request before accepting its body.
- `http_response(status)`, `http_add(message, name, value)`, and
  `http_trailer(message, name, value)` construct a response. Check the boolean
  result of field additions. `http_text`/`http_bytes` append body content.
- `http_send_response(reader, request, response)` applies method/status framing,
  generates Date, and closes the *HTTP exchange* via the Connection field when
  necessary. The caller must call `http_close` when either message requests
  closure, on error, or after a rejected CONNECT. On success, the caller may
  read the next request. After a protocol switch, hand off the reader instead.
- `http_body_reader(reader, message)` followed by `http_body_read(state, buffer)`
  pulls decoded body bytes into caller-owned nonempty buffers: a positive count,
  0 for completion, or -1 for failure. It preserves pipeline bytes and places
  final trailers on `message`. Do not call the buffered body reader afterward.
- For streamed output, set `message.framing = 2`, validate/build its head with
  `http_write_head`, send the head with `http_send`, then call `http_send_chunk`
  repeatedly and `http_end_chunks` once. Empty data chunks are no-ops, not
  terminators. Use a region around each emitted chunk to reclaim scratch data.
  For HEAD or bodyless statuses, send only the head and no chunks/trailers.
  These low-level send-only functions leave concurrent response monitoring to
  the caller; use `http_poll` and the parser, or the monitored `http_exchange`
  path for buffered requests.

For buffered output, the serializer owns Host, Content-Length,
Transfer-Encoding, Connection, and Trailer. Set `authority`, `close`, and
`framing` instead of adding these fields manually. This prevents conflicting
lengths and CRLF injection. `framing = 2` selects chunked output; otherwise a
body is length-delimited. HTTP/1.0 cannot use chunking. A HEAD response uses the
buffer's size as representation metadata but suppresses content. For a 304,
set `length = -1` to omit Content-Length when representation length is unknown.
`TE: trailers` automatically adds the required Connection option. Upgrade
requests similarly add `Connection: Upgrade`.

The library always validates before the high-level sender emits any head bytes.
Applications using low-level serialization must check `message.error` before
sending the returned buffer. Never interleave two readers/writers on one socket
or reuse a connection with an unread body.

## Representation helpers

`http_representation(request, data, size, content_type, etag, modified)` constructs
a conditional/range-aware response for an existing selected representation.
It implements strong/weak ETag comparison; precondition precedence; 304/412;
If-Range; closed/open/suffix ranges; 206/416; and multipart/byteranges with a
boundary verified absent from the representation. It ignores invalid, unknown,
or excessively numerous ranges and caps aggregate output. HEAD ignores Range.
Call this after resource selection and authorization.

For write methods, call
`http_preconditions(request, etag, modified, exists)` **before** performing the
mutation. It returns 0, 304, or 412. The application owns actual resource state
and must make the check and mutation atomic. `modified` is a Unix timestamp;
-1 disables time-based validation when modification time is unknown. Use a
valid quoted ETag, optionally prefixed by `W/`.

`http_parse_date` accepts IMF-fixdate, RFC850, and asctime dates, including leap
seconds, and returns `HTTP_INVALID_DATE` on failure. Obsolete two-digit years
are resolved against the full current date and time, including the second at
the 50-year boundary and century transitions. `http_parse_date_at(text, now)`
accepts an explicit Unix timestamp for deterministic interpretation/testing.
`http_date_at` emits IMF-fixdate. Date parsing uses libc's initial C locale; applications that change
LC_TIME should restore C when using these helpers.

## Limits and explicit scope

Defaults, configurable through the `HTTP_*` globals before creating messages:

| Limit | Default |
|---|---:|
| Start-line / field-line / chunk-size line | 8,192 octets excluding CRLF |
| Header or trailer section | 65,536 octets |
| Fields per section | 100 |
| Empty Transfer-Encoding list entries across all field lines | 16 |
| Incoming decoded body / buffered outgoing body | 16 MiB |
| Cumulative chunk-size/extension metadata | 16 MiB |
| Read/write transaction deadline | 10 seconds |
| Informational responses per client exchange | 32 |
| Byte ranges per response | 16 |

Keep limits positive and within L8's 512 MiB heap; increasing a buffered-body
limit also increases possible allocation. Network I/O uses absolute deadlines,
partial writes, EINTR/EAGAIN handling, and MSG_NOSIGNAL. DNS resolution is
synchronous libc `getaddrinfo` and is outside the socket deadline. Streaming
output applies the size limit per chunk; callers control total output size.
The low-level caller also controls when to reset `reader.deadline`.

The parser requires CRLF, rejects obsolete folded fields, rejects TE+CL, accepts
only identical duplicate Content-Length values, validates chunks/extensions,
and rejects framing/routing/authentication fields in trailers. Transfer-Encoding
ignores up to `HTTP_MAX_EMPTY_LIST_ELEMENTS` empty list entries, including those
in repeated field lines. An entirely empty coding list is still invalid, as are
repeated/non-final chunked codings, malformed parameters, HTTP/1.0 transfer
coding, and TE+CL conflicts. Commas inside quoted parameters are not separators.
Content-Length retains its separate, strict duplicate-value recovery rules. Authorities use
a conservative URI policy: no userinfo, unbracketed IPv6, comma-containing host,
or nonnumeric/out-of-range port. These choices are deliberate rejection policies.

Only chunked transfer coding is implemented. Other transfer codings fail
explicitly; content codings such as gzip remain opaque representation bytes.
TLS/HTTPS transport, HTTP/2, HTTP/3, proxy forwarding, caching, cookie storage,
authentication mechanisms, automatic redirects, content negotiation, compression,
and automatic retries are outside this implementation. Their fields can be
carried by the library. RFC 9111 is retained as a reference for future caching,
not claimed as implemented. Status-specific application obligations (e.g.
WWW-Authenticate with 401, Allow with 405) remain the handler's responsibility.
