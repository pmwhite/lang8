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
