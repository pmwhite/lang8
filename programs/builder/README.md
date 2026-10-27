# Byte builder

Import `builder.l8` and use the `builder` tag. A `ByteBuilder` gathers text
or binary data whose size isn't known before it is made: its first `size`
bytes of `data` are what was added, and the rest is room. It imports only
the standard library and builds natively and for Wasm.

```l8
line: *ByteBuilder = builder_new(64);
builder_str(line, "Psalm ");
builder_int(line, 119);
builder_byte(line, 10i8);
out: []i8 = builder_slice(line);
```

`builder_byte`, `builder_bytes(builder, source, from, to)`, `builder_str`
and `builder_int` (decimal, with a minus sign) add to it, growing `data` by
doubling; `builder_reserve` makes room for a count of bytes ahead.
`builder_slice` copies what was added into a slice exactly its length, and
`builder_text(builder, from, to)` copies a span of what was added as a string
(a NUL in it is an error, as `cstr` reports it, and a span past what was added
fails as a slice's bounds do). `builder_clear` forgets what was added and
keeps the room.

A builder grows from the allocation destination of the call that adds to
it, so add to it where it was allocated: in its own region or arena, or
through a parameter at the caller's destination. The compiler rejects a
call that would grow a builder held from outside into a shorter-lived
region. The test in `builder.l8` shows the contract: `l8 test
programs/builder/builder.l8`.
