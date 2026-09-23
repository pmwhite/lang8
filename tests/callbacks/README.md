# Function values and C callbacks

Run `./build.sh callback-test` to build the compiler and run the tests. After
`./build.sh selfhost`, `./l8 build tests/callbacks/basic.l8 -o .build/callbacks-demo`
builds a runnable example. The checked-in bootstrap is unchanged; use a compiler
built from either source stage for this syntax. `fn` is contextual in type
positions; existing variables named `fn` still work.

L8 function values use `fn` with named parameters and an optional result:

```l8
tag example;

compare(a: *i32, b: *i32): i32 {
    if (a.* < b.*) { return -1i32; }
    if (a.* > b.*) { return 1i32; }
    0i32;
}

main(): int {
    callback: fn(left: *i32, right: *i32): i32 = &compare;
    a: i32 = 3i32;
    b: i32 = 7i32;
    callback(&a, &b) as int;
}
```

Use `&name` for a top-level L8 function. Function values occupy one machine
pointer and can be stored in globals, arrays, and C-layout listener structs,
passed to `extern` functions, returned, and called through expressions. There
are no closures or captured locals. `?fn(...)` permits null; narrow it with a
null check or `or` before calling. Signatures compare parameter types and lifetime
bounds, with parameter names matched by position. They also compare the
`noregion` requirement and the set of declared exceptions.

Ordinary function values support L8 records, enums, fixed arrays, slices,
strings, lifetime bounds (including `@new`), and `noreturn`. For example:

```l8
transform: fn(value: Point): Point = &move;
allocate: fn(n: int): []int@new = &make;
action: fn() raises Error = &try_action;
save: fn() noregion = &store;
```

Indirect calls enforce the same argument, lifetime, exception, and region checks
as direct calls. There is no separate `cfn` type or calling-convention annotation.
See `native.l8` and `effects.l8` for runnable examples.

C compatibility is checked in `extern` declarations, recursively through callback
parameters/results and listener fields. A compatible L8 function can be passed
with `&name` using the same `fn` type:

```l8
extern qsort(base: *i32, count: int, width: int,
    compare: fn(a: *i32, b: *i32): i32): int;
```

The supported foreign ABI is Linux x86-64 System V. Callback parameters and
results at this boundary may be integer scalars, booleans, floats, raw object
pointers (including nullable pointers), or
other compatible function values. Omitting the result means C `void`. Foreign
callback signatures using aggregates by value, counted strings/slices, or
`noreturn` are rejected. Variadic function types are not supported. Use pointers
to C-layout structs for aggregate data. `i8` is unsigned;
use `i32` for C `int` and `int` for C `long`/`size_t` on this platform.

Function signatures preserve L8 lifetime contracts. An unannotated pointer
parameter is borrowed for the call; named bounds and `@immortal` have their usual
meaning. As with all foreign declarations, the binding must accurately describe
the foreign API's ownership promises. The callback address lives for the process,
but its userdata and listener storage must remain alive until the foreign library
has stopped using them. C callbacks must run on the L8 thread; the runtime heap
and exception machinery are not thread-safe, and callbacks are not async-signal-safe.

Exceptions must be caught inside C callbacks. Functions declaring `raises` or
requiring `noregion` cannot be passed as foreign callbacks: a foreign library may
invoke them while an L8 region is active. Parameters/results using `@new` are also
unsupported at this boundary. Taking the address of an `extern` function is not
yet supported; an L8 wrapper with a compatible signature can call it instead.

Typed aliases let a C entry point have multiple L8 declarations with concrete
pointer types. The right-hand name is a linker symbol, not an L8 reference:

```l8
extern compare_strings(a: str, b: str): i32 = strcmp;
extern compare_bytes(a: *i8, b: *i8): i32 = strcmp;
```

The normal argument, lifetime, and foreign callback checks apply to each alias.
`aliases.l8` tests both direct binaries and textual assembly. The Wayland binding
uses this for the different listener tables and argument layouts accepted by
`wl_proxy_add_listener` and `wl_proxy_marshal_array_flags`.

ABI references: [x86-64 System V psABI](https://gitlab.com/x86-psABIs/x86-64-ABI)
and [glibc comparison callbacks](https://sourceware.org/glibc/manual/latest/html_node/Comparison-Functions.html).
