# Verified array indexing

L8 should compile an array access only when it can prove `0 <= i < len(a)`.
An unproved access is an error with a diagnostic identifying the missing fact.
Ordinary control flow can establish that fact: a guard may return or raise when
the index is invalid, and code after the guard may index the array.

The programmer-facing concept is `index_for(a)`: an integer valid for a particular
array value. A function can take or return such an index. Its callers may satisfy
the requirement through a guard, a loop, a constructively valid index, or their
own parameter requirement. The compiler should infer function requirements from
bodies where practical. Explicit contracts are available when inference needs
help or an API author wants to state the requirement.

The verifier tracks numeric ranges, comparisons with array lengths, and small
constant offsets for lookahead. It learns from assignments, branches, short-
circuit conditions, and common loops. It recognizes ordinary range and cursor
loops automatically. Other loops may carry an invariant that the compiler proves
at entry and after every iteration.

Proofs refer to values, not merely variable names. Reassigning an array or a
field that holds one invalidates facts tied to the old value. Calls preserve
facts only when their verified effects permit it. Arithmetic in proofs follows
L8's actual overflow behavior. Contracts and invariants are checked, never
trusted assertions.

Start with array, slice, and string indexing. Apply the same mechanism to spans
and bulk operations where it stays simple. Keep compilation fast and predictable;
diagnostics should make a missing guard, contract, or invariant apparent.

Inspiration: the Index Checker's array-relative types, Pentagons' lightweight
range reasoning, and Wuffs' requirement for a compile-time proof of each access.

## Initial implementation

Stage 2 provides `compile --verify-bounds` and `build --verify-bounds`. In this
mode the compiler rejects unproved index expressions and omits their generated
runtime checks. The flag allows existing program targets to migrate separately
while ordinary builds keep their current checks.
It also warns when a `check_index` is redundant because the verifier can prove
the index in bounds before the call. A warning is emitted only when that proof
holds on every analyzed visit to the call site; no warning does not mean the
runtime check is necessary.

`index_for` is a reserved keyword. `i: index_for(a)` declares a function parameter
whose value is valid for array parameter `a`. The compiler also infers this
requirement from direct indexing and forwards it through ordinary calls.
Requirements on functions used as
function pointers are rejected until function types can carry them. Guards,
known-length arrays and slices, guarded constant lookahead, range loops, and
common cursor loops provide local proofs. A `while` loop may carry
`invariant (condition)` after its test;
the compiler checks it at entry and after each iteration. Invariants are pure
compile-time conditions.

Length comparisons also carry relationships between local arrays: after
`len(a) == len(b)`, a loop over `a` can index `b` while both lengths remain
stable. A range loop over `len(record.field)` can index that field when its body
has no calls or writes that could change the field's length. The verifier keeps
facts entering a range loop only while its body preserves them.

The verifier also records strict and non-strict inequalities between named field
paths and lengths. A guard such as `0 <= b.cursor && b.cursor < len(b.data)`
proves `b.data[b.cursor]`. A guard establishing `b.used <= len(b.data)` lets a
stable loop over `0..b.used` index `b.data`. Assignments through fields and
calls that may change either side discard these relationships. The compiler
infers transitive sets of fields written by each function and preserves a fact
across a call when those writes cannot affect its field paths. Unknown writes
discard the fact. For direct fields of a record parameter, a write to the same
field through a different parameter can preserve the fact if those parameters
are distinct. The compiler infers this separation requirement only when a
later bounds proof uses the preserved fact, then propagates the requirement
through callers. A caller can satisfy it with distinct fresh records or a
guard such as `if (a == b) return`, and a function can instead use
`check_index` after the call. An unproved call is rejected. Nested paths and
unknown aliases remain conservative; inferred cross-function count/capacity
requirements are future work, so callers must currently establish those facts
within the function that uses them.

`check_index(a, i)` is the explicit runtime bridge. It checks
`0 <= i < len(a)` once and exits with status 1 on failure, as ordinary checked
indexing does. It returns the checked index, so an access can use
`a[check_index(a, i)]`. For variable arguments, a standalone call also establishes
a reusable fact: strict mode accepts later `a[i]` and calls requiring
`i: index_for(a)` until a relevant value changes. Stable field and index
expressions are accepted inline; an expression with an arbitrary function call
must first be bound to a variable so the value checked is the value used. A
normal guard remains useful when the caller needs to return or raise a
particular error.

```l8
check_index(a, i);
use(a[i]);
```

The verifier deliberately rejects patterns it cannot express, including some
nontrivial index arithmetic. It does not yet give `index_for` to return values
or verify the spans used by bulk operations. The `--verify-bounds` flag remains
opt-in while those extensions are evaluated.

## Migration

The standard-library tests, both compiler stages, and all shipped program and
test roots now compile under `--verify-bounds`. `./build.sh all` checks these
roots in strict mode and runs the normal runtime suites. Most dynamic accesses
use an inline `check_index`; sites with a useful shared guard can call it once
before later accesses. Strict compilation remains opt-in for now, so newly
added roots should be included in the build's strict source list.
