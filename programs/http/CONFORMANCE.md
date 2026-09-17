# Specification and test map

The implementation targets the HTTP/1.1 **origin endpoint and user-agent
messaging roles**, not every optional HTTP extension or intermediary role.
This matrix is a coverage inventory, not formal certification. All named tests
are executable with `./build.sh http-test`; source RFCs and verified errata are
pinned by `spec/SOURCES.json`. No test needs a public server.

## RFC 9112: HTTP/1.1

| Sections | Behavior / policy | Evidence |
|---|---|---|
| 2.1–2.2 | Octet parsing, CRLF, one leading empty request line, reject bare CR/LF and controls; strict whitespace | `test_start_line_and_host_rejections_rfc9112_2_3`, `test_header_grammar_rfc9112_5`, `test_every_network_split` |
| 2.3 | HTTP/1.0 and 1.x, case-sensitive syntax, reject other major versions, send supported version | `test_persistence_rfc9112_9_3`, `test_http10`, `test_start_line_and_host_rejections_rfc9112_2_3` |
| 3–3.1 | Case-sensitive extensible method tokens, 8 KiB start-line support/limit | `test_request_forms_rfc9112_3_2`, `test_start_line_and_host_rejections_rfc9112_2_3` |
| 3.2.1–3.2.4 | Origin, absolute, authority, and asterisk forms; absolute authority overrides Host | `test_request_forms_rfc9112_3_2`, `test_start_line_and_host_rejections_rfc9112_2_3` |
| 3.2, 3.3 | Require exactly one syntactically acceptable Host in HTTP/1.1; reconstructed target/authority exposed | Same tests, including duplicate/missing/invalid Host and differing absolute authority |
| 4 | Three-digit 100–599 status, optional empty reason, binary header values; method-aware responses | `test_response_body_precedence_rfc9112_6_3`, `unit.l8` |
| 5–5.1 | Token names, case-insensitive lookup, OWS trimming, separate ordered duplicates, obs-text | `test_header_grammar_rfc9112_5` |
| 5.2 | Reject obs-fold rather than unfold | `test_header_grammar_rfc9112_5` |
| 6.1 | Decode/encode chunked, tolerate bounded empty coding-list entries, prohibit HTTP/1.0 TE and TE+CL; fail unsupported codings explicitly | `test_transfer_encoding_rfc9112_6_1`, `test_transfer_coding_empty_elements_rfc9110_5_6_1_2`, `test_empty_transfer_elements_do_not_weaken_framing`, `test_chunked_request_and_response`, `unit.l8` |
| 6.2 | Decimal overflow detection, identical CL lists/duplicates, invalid/conflicting length rejection | `test_content_length_rfc9112_6_3`, `test_bad_framing_and_incomplete_body_close` |
| 6.3 | Body-length precedence for HEAD/1xx/204/304/CONNECT, fixed/chunked/EOF, requests without framing | `test_response_body_precedence_rfc9112_6_3`, `test_content_length_rfc9112_6_3`, `test_upgrade_and_connect_handoff_preserve_buffered_bytes` |
| 7.1 | Hex sizes, terminal chunk, binary data, overflow/size/overhead limits | `test_chunked_rfc9112_7_1`, `test_generated_binary_chunk_cases`, `test_many_small_chunks` |
| 7.1.1 | Ignore syntactically valid chunk extensions; validate tokens, BWS, quoted strings/escapes, bound length | `test_chunked_rfc9112_7_1`, `unit.l8` |
| 7.1.2 | Separate trailers, no merging; reject fields affecting interpretation | `test_chunked_rfc9112_7_1`, `test_streaming_buffers`, `unit.l8` |
| 7.1.3 | Streaming decoder preserves leftovers and reports completion only after terminator/trailers | `test_streaming_buffers`, `test_every_truncation_rfc9112_8`, `test_streaming_sender` |
| 7.2–7.3 | No optional gzip/deflate/compress transfer-coding codec or new coding registration | Unsupported transfer codings produce a local 501 error; `test_transfer_encoding_rfc9112_6_1` |
| 7.4 | Never advertise unsupported transfer codings; TE: trailers adds Connection: TE | `unit.l8` |
| 8 | Premature EOF/error never treated as a complete length/chunk-framed message | Every truncation point in `test_every_truncation_rfc9112_8`; independent truncated responses in `test_client_independent_responses` |
| 9.1 | TCP IPv4/IPv6, connect failure handling and deadlines | `test_ipv6`, all network tests |
| 9.2 | Associate responses in request order, consume informational responses, one outstanding client request | `test_client_reuses_connection_in_order`, `test_client_independent_responses` |
| 9.3 | Persistence, HTTP/1.0 opt-in, complete bodies before reuse, explicit close | `test_persistence_rfc9112_9_3`, `test_python_client_keep_alive_head_and_echo`, `test_request_limit_closes_after_final_response` |
| 9.3.1 | No automatic retries, including unsafe methods | Client errors return to caller; retry policy intentionally absent |
| 9.3.2 | Ordered server responses to pipelined requests; client does not originate pipelines | `test_pipeline_and_close_rfc9112_9` |
| 9.4–9.5 | Concurrent connections, bounded workers/messages, absolute deadlines; monitor responses during buffered client uploads and stop on early final responses | `test_timeout_and_concurrency`, `test_request_limit_closes_after_final_response`, all `test_upload.py` tests (fixed/chunked, Expect/fallback, informational responses, half-close, invalid/stalled responses) |
| 9.6 | Stop after Connection: close; graceful half-close/drain; preserve failures | `test_pipeline_and_close_rfc9112_9`, `test_bad_framing_and_incomplete_body_close` |
| 9.7–9.8 | TLS connection initiation/closure | Outside selected TCP-only scope |
| 10 | message/http and application/http encapsulation | Not exposed; raw network messages only |
| 11.1–11.2 | Framing ambiguity, header/target/reason injection, forbidden trailer fields | `unit.l8`, malformed-wire tests, `test_mutated_messages_do_not_crash` |
| 12–13, appendices | Registries, references, collected syntax, historical changes | No registration action; implemented syntax exercised above |

## RFC 9110: shared semantics

| Sections | Implemented coverage / ownership | Evidence |
|---|---|---|
| 1–3 | Architecture, roles, conformance terminology | Scope and role definitions above; not independent runtime features |
| 4 | URI request-target parsing and authority reconstruction; HTTPS transport excluded | Request-form tests; URI characters, escapes, IPv6/IPvFuture, userinfo rejection in parser |
| 5 | Field syntax/ordering/extensibility and size limits; field-specific interpretation left to feature owners | `test_header_grammar_rfc9112_5`, `test_content_length_rfc9112_6_3`, `unit.l8` |
| 5.6.7 | Three HTTP-date formats, invalid-date handling, IMF output, leap seconds; obsolete-year rollover compares the full timestamp, including the 50-year boundary | `test_three_date_formats_rfc9110_5_6_7`, all deterministic `test_dates.py` boundary/century/calendar tests, `unit.l8` |
| 6 | Message control data/content/trailers and automatic Date; extension fields retained | Response precedence, binary-body, trailer, and Date tests |
| 7 | Origin target selection, Connection/Upgrade handling, CONNECT transition; no intermediary forwarding | Request-form, persistence, and handoff tests; upgrade selection validated by client |
| 8 | Representation bytes, type, length, validators; content codings remain opaque | Binary echo, header tests, conditional/range tests |
| 9 | Extensible method syntax; GET/HEAD/OPTIONS example; write methods require an application handler | `test_python_client_keep_alive_head_and_echo`, `unit.l8`; demonstration PUT/DELETE semantics documented in README |
| 10 | Expect: 100-continue, early rejection/final response, bounded fallback; other fields preserved | `test_expect_continue_and_reject_without_body`, `test_client_expect_early_final`, `test_client_expect_fallback` |
| 11 | Authentication mechanism/resource authorization | Handler responsibility; fields preserved without implicit credentials or retries |
| 12 | Representation selection and content negotiation | Handler responsibility; no automatic encoding/language/media-type selection |
| 13 | Strong/weak/wildcard/list ETags; conditional precedence; date validators; If-Range | `test_etags_and_precedence_rfc9110_13`, `test_if_range_rfc9110_13_1_5`, `unit.l8` |
| 14 | Byte ranges, suffix/open/large bounds, invalid/unsatisfiable sets, multipart and Content-Range | `test_single_ranges_rfc9110_14`, `test_multipart_ranges`, `unit.l8` |
| 15 | Status syntax/classes; 1xx/HEAD/204/205/304/CONNECT output rules; generic extension statuses | `test_response_body_precedence_rfc9112_6_3`, `unit.l8`; status-specific resource/auth/redirect fields remain handler responsibilities |
| 16 | Extension method/field/status handling | `test_request_forms_rfc9112_3_2`, header tests, status 599 fixture |
| 17 | Parser injection, ambiguous framing, resource limits, protocol transition handoff | Protocol, mutation, concurrency, deadline, and CONNECT regression suites |
| 18–19 | Registries and references | No registration action |

Verified errata relevant to implemented behavior: 9110 EID 7306 permits OWS
after `bytes=` (tested); 9110 EID 8268 / 9112 EID 8284 clarify absolute-form
routing precedence (tested). Other verified errata concern media negotiation
examples, charset naming, redirect method preservation, and TLS certificate
identity deprecation. The client performs neither automatic redirects nor TLS.
The pinned inline snapshots contain the complete verified corrections.

## RFC 9931 and optional roles

- RFC 9931 §8: CONNECT never transmits optimistic tunnel data; rejected CONNECT
  replies force Connection: close, and the server processes no subsequent
  request. `test_connect_rejection_closes_rfc9931` and `unit.l8` cover these rules.
- RFC 9931 upgrade guidance: only confirmed, solicited transitions are exposed.
  The library does not implement connect-udp, connect-ip, or WebSocket itself.
- RFC 9111 caching requirements are inapplicable to this non-caching endpoint.
  The document is included for reference. Cache-Control/Age/etc. are preserved,
  but there is no cache lookup, freshness calculation, or storage.
- Proxy transformations, forwarding-specific Via/Connection removal,
  proxy authentication, TLS, HTTP/2/3, and message/http packaging are not claimed.

## Test strategy and limits of the evidence

The suite combines direct L8 API checks, a stdin-fed parser probe, generated
binary and malformed fixtures with fixed seeds, every truncation point for two
framing modes, every two-write split for a chunked request, persistent/pipelined
sessions, independent Python HTTP peers, raw socket peers, IPv6, deadlines,
large binary content, and 100,000 tiny chunks. The upload regressions use a
small client send buffer and a rejecting peer to impose backpressure, verify
that most content remains unsent, and check informational responses, malformed
responses, EOF-delimited rejection bodies, and unchanged transaction deadlines.
Calendar tests inject a fixed current time instead of depending on the test
machine's clock. Two TCP writes need not imply two
packets; byte-at-a-time independent response writers and tiny streaming consumer
buffers provide additional boundary coverage.

Tests verify protocol behavior rather than counting RFC keywords. They do not
prove exhaustive conformance, model-check all parser states, certify deployment
security, or test arbitrary handler logic. Unsupported behavior is explicitly
listed above instead of represented as a passing test.
