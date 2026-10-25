The L8 language aims to be completely memory safe. It has a few facilities for
allocating values to be used in the program:

1. Global declarations introduce names for values that are allocated at the
   beginning of the process and freed at the end of the process.

2. Local function declarations introduce names for values whose space gets
   reserved at the beginning of the function, and then unreserved at the end of
   the function.

   A plain block, each `if` branch, and each `while` or `for` body introduces a
   lexical scope, even when the control-flow body has no braces. A `for` loop also
   scopes its iteration variable. These scopes limit name visibility; only a
   `region` block resets the dynamic heap.

3. The "new" keyword allocates memory on the heap for the specified type. We
   call this a "dynamic" allocation. Each dynamic allocation extends the end heap
   by the appropriate amount of memory. Alongside the "new" keyword is the
   "region" keyword, which precedes a block inside which all allocations are
   associated with a new region. What happens is that when the region ends, the
   end of heap is reset to the point that it was at when the region began,
   effectively freeing all the dynamic allocations that occurred within that
   block.

The language assumes the responsibility of ensuring that values are not used
beyond their lifetime. To ensure this, each function is analyzed in isolation
to determine the "signature" of the function with respect to input and output
lifetimes. The signatures are consulted at callsites, since the signature of a
function being called impacts the signature of the function calling it.

A "lifetime" is the name we give to the duration during which a variable is
active. The longest lifetime is "immortal", which is what global variables and
dynamic allocations outside of any region are given. "new" is another lifetime
that may show up sometimes, which refers to the lifetime of the enclosing scope
(which means it is context-dependent). There is no name for the enclosing
function because there is no constraint that would ever need to reference it.

For the signature of a function, the aim is to compute a set of inequality
constraints on the parameters and return type. Each parameter name is also a
variable name in the constraint set, and is also a variable that might be used
in the return lifetime as well.

After constraints are collected, they can be concisely notated by expressing
the lifetime of each parameter as an expression for the minimum lifetime a
parameter must have. And the return type is annotated with an expression for
the longest lifetime it may be relied upon to have.

In addition to lifetimes, we also have to know whether a function is a
"noregion" function, which means that it cannot be used in a context inside a
region. The main reason for this is if it does a dynamic allocation and then
uses that value in an immortal context. This may not be exposed in any way by
parameters or the return type, so we have it as an piece of information that
analysis of a function must determine.

## Owned arenas

`owned *T` is a unique, movable handle to an arena and its root `T`. An arena
can outlive the function that creates it. `?owned *T` also admits `null`.

```l8
type Box = { value: int }

make_box(): owned *Box {
    own { new Box { value: 1 } }
}

main(): int {
    box: owned *Box = make_box();
    borrow box {
        // Here box is the root *Box, with the same name as its owner outside.
        alias: *Box = box;
        alias.value = 2;
        allocate alias {
            _extra: *Box = new Box { value: 3 };
            // New allocations use box's arena; ordinary calls inherit it too.
        }
    }
    next: owned *Box = move box;
    drop next;
    0
}
```

`own` creates an independent arena. Its block must produce a pointer allocated
in that arena. If construction raises or otherwise leaves the block before
completion, the incomplete arena is reclaimed. The completed handle has no
automatic destructor: explicitly `drop` it when finished. Dropping an empty
handle is harmless. Moving a handle empties its source; copying one is an error.
Assignment requires an empty destination and does not free its old value.
An owner assignment has no value; it cannot also supply a second owner through
a surrounding expression.
Handles can be locals, globals, parameters, and return values. They cannot yet
be record or variant fields, array or slice elements, or pointer targets.

`borrow name { ... }` temporarily exposes the root through the same name. An
ordinary local assignment can give that pointer another name. Mutable aliases
are allowed; a borrow does not impose Rust's exclusive-reference rule. Pointers
from the borrow cannot escape into longer-lived storage. `match` payloads remain
shallow copies in arm locals. A pointer copied from a region or arena scrutinee
keeps that lifetime, so it cannot outlive the value it was copied from. Changing
a variant's tag through another alias does not change the payload local's layout.

`allocate pointer { ... }` selects the arena recorded for a local borrowed
pointer or its local alias. A `borrow` alone does not change where `new`
allocates. A `region` inside `own` or `allocate` provides scratch storage in the
selected arena and rewinds it on exit. Scratch cannot be retained in the arena.
An independent arena can capture immortal pointers, but cannot retain pointers
into another arena, a caller's borrowed data, or a lexical region. Copy that data
into the new arena instead. Existing `@new` contracts refer to the allocation
destination at the call; a call inside a scratch region does not require its
caller to retain the arguments in the caller's allocation destination.

The runtime keeps a borrow count and rejects dropping an arena while borrowed,
including an indirect drop through a global. Moving an owner while borrowed is
allowed: the borrow keeps the original arena, and its new owner still cannot
drop it until the borrow ends. Return, loop exits, and exceptions release scope
frames and borrows. External native calls temporarily select the process heap,
so a reentrant callback does not inherit its caller's arena. Foreign code must
still obey declared lifetime contracts and must not retain borrowed pointers.

Native arenas use mapped chunks, returned to the OS on `drop`. WebAssembly
returns chunks to a reusable free list because its linear memory cannot shrink;
its memory therefore follows its peak working set. Scope frames (regions,
borrows, allocation scopes, and suspended external calls) are limited to 64
simultaneous frames natively and 4096 in Wasm; exceeding the limit exits with
status 1. File descriptors, sockets, native objects, and other external resources
remain the programmer's responsibility. Dropping an arena only reclaims memory.

## Strings and byte slices

`str` is the language's string and C-string boundary type. It is immutable,
contains a byte length, and guarantees one trailing NUL byte that is not part of
that length. Interior NUL bytes are forbidden. String literals default to `str`
and process arguments are `str`; equality compares their bytes, and indexing
and iteration use the stored length rather than searching for the sentinel.
`?str` is the nullable form.

`[]i8` is an ordinary mutable byte slice and carries no termination guarantee.
`cstr(bytes)` validates and copies a byte slice into a `str`, while `bytes(s)`
makes a mutable copy of a `str`. Foreign functions that consume a C string use
`str` (or `?str` when null is meaningful), making the termination requirement
part of their signatures. General zero-terminated array types are intentionally
not part of the language.

For source compatibility, a literal can be contextually typed as `[]i8` when it
directly initializes or is passed to a byte-slice slot. An existing `str` never
converts implicitly; use `bytes(s)` when mutation is intended.
