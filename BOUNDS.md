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
runtime checks. The flag allows existing code to migrate function by function
while ordinary builds keep their current checks.

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

The initial verifier deliberately rejects patterns it cannot express, including
nontrivial index arithmetic and mutable record fields. It does not yet give
`index_for` to return values or verify the spans used by bulk operations. Those
extensions and migration of the existing programs remain necessary before
strict verification can become the default build mode.
