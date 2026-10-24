The allocation model below describes the current language. The incremental
migration toward fixed-capacity storage is specified in
[STATIC_ALLOCATION.md](STATIC_ALLOCATION.md).

L8 is migrating to bounded static storage. It has these storage facilities:

1. Global declarations introduce names for values that are allocated at the
   beginning of the process and freed at the end of the process.

2. Local function declarations introduce names for values whose space gets
   reserved at the beginning of the function, and then unreserved at the end of
   the function.

   A plain block, each `if` branch, and each `while` or `for` body introduces a
   lexical scope, even when the control-flow body has no braces. A `for` loop also
   scopes its iteration variable. These scopes limit name visibility; only a
   `region` block resets the dynamic heap.

3. `static_buffer` reserves a fixed counted backing array for a global slice;
   `buffer` reserves a counted backing array in a function's frame; `zeroed`
   initializes an inline fixed-array value. Their capacities are compile-time
   constants. A slice literal directly initializing a global also uses static
   storage. See [STATIC_ALLOCATION.md](STATIC_ALLOCATION.md) for syntax, fill
   evaluation, storage duration and the `--static` compiler mode.

4. The legacy "new" keyword allocates memory on the heap for the specified type. We
   call this a "dynamic" allocation. Each dynamic allocation extends the end heap
   by the appropriate amount of memory. Alongside the "new" keyword is the
   "region" keyword, which precedes a block inside which all allocations are
   associated with a new region. What happens is that when the region ends, the
   end of heap is reset to the point that it was at when the region began,
   effectively freeing all the dynamic allocations that occurred within that
   block.

## Storage duration and compatibility annotations

Source-built compilers no longer perform lifetime analysis. `@name`, `@new`,
`@immortal`, and `noregion` still parse and format for source compatibility, but
have no effect on stores, returns, calls, or function type compatibility.
Function types still compare parameter/result types and declared exceptions.
Null narrowing, definite assignment, bounds checks, and foreign ABI checks remain.
Both source stages remove the analysis and its inferred metadata. The promoted
bootstrap also accepts the compatibility annotations without lifetime checking.

Storage duration remains a runtime property. Frame-backed `buffer` values and
addresses of locals expire on return; region allocations expire when rewound.
The compiler now accepts references that outlive this storage, so programs must
keep retained values in permanent storage or explicitly managed pools. A reused
pool slot can invalidate an older reference; use indices with generation checks
when stale handles are possible. Static allocation alone does not prevent stale
references or use after return.

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

## Native process bounds during migration

Startup arguments and environment snapshots have 4,096-entry vectors and
separate 4 MiB counted-text stores. Reading the environment borrows its permanent
snapshot. Native legacy heap backing is reserved in BSS rather than mapped at
startup; it remains available only while allocation paths are migrated. See
[STATIC_ALLOCATION.md](STATIC_ALLOCATION.md) for the current verification scope.
