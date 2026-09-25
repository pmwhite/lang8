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
The compiler does not warn about redundant `check_index` calls. A check can
appear provable at its call site because its own earlier execution established
the facts needed on a later loop iteration. Use the isolated strict-compilation
tool described below to find removable inline checks.

`index_for` is a reserved keyword. `i: index_for(a)` declares a function parameter
whose value is valid for array parameter `a`. The compiler also infers this
requirement from direct indexing and forwards it through ordinary calls.
For relationships that inference cannot select, a function can state an entry
contract after its return type:

```l8
advance(a: []int, n: int): int requires (0 <= n && n <= len(a)) {
    if (n == len(a)) return n;
    a[check_index(a, n)] = 1;
    n + 1
}
```

`requires` accepts conjunctions of `<`, `<=`, `>`, `>=`, and `==` comparisons
between nonnegative constants, integer parameter paths, and lengths of
indexable parameter paths. Each direct call must prove the condition before
entering the function; the verifier assumes it at the function entry and
infers its return bounds from the body under that assumption. Arguments used
in the condition must be stable paths. `main` and indirectly called functions
cannot have such a contract. The condition is a compile-time proof obligation,
not a runtime check.
Requirements on functions used as
function pointers are rejected until function types can carry them. Guards,
known-length arrays and slices, guarded constant lookahead, range loops, and
common cursor loops provide local proofs. A `while` loop may carry
`invariant (condition)` after its test;
the compiler checks it at entry and after each iteration. Invariants are pure
compile-time conditions.

The compiler also infers requirements for a constant access to an array
parameter or its direct field (`out[1]` requires `len(out) >= 2`), and for a
direct field index into a direct field array of the same parameter
(`b.data[b.cursor]` requires `0 <= b.cursor < len(b.data)`). These requirements
propagate through direct calls. Callers can satisfy them with known lengths or
guards; a call that cannot prove one is rejected. Writes that may invalidate a
required fact still discard it within the callee, so an entry requirement does
not justify an access after such a write. Nested paths, arithmetic indices,
and indirect calls carrying these requirements are outside this inference pass.

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
unknown aliases remain conservative. Automatically inferred cross-function
count/capacity requirements remain future work; the explicit record invariants
below provide a durable relationship when a type declares one.

Copying a stable integer field into a local also copies its proved inequalities
to stable paths, so `first = r.count` retains `first <= len(r.items)` when later
calls change `r.count` but preserve `r.items`. Replacing an element of a flat
record array discards facts about that element's record type while preserving
facts about unrelated record types and the containing array's length. For
records with pointer or aggregate fields, element replacement remains
conservative.

## Record invariants

A record type may state a pure invariant over its fields. For example:

```l8
type Buffer = {
    data: []int;
    used: int
} invariant (0 <= used && used <= len(data))
```

In strict bounds mode, the syntax above is supported. Within a record invariant,
bare names refer to fields of that record; other variable names are not in
scope. `len` and other supported pure built-ins retain their usual meaning.
This avoids a `self` binder while keeping each reference unambiguous. Invariants
use the pure comparisons and array lengths that the bounds verifier proves.
The compiler proves an invariant when a record is constructed and after
**every assignment to any of its fields**. Updating two
related fields may therefore require replacing the record as one value. An
invariant is a verified fact available when a function receives or reads a
record; callers do not need to repeat a guard for that fact. Calls and aliases
must preserve the promise: a field write through any alias has the same proof
obligation. Foreign functions that receive an invariant-bearing record are a
trusted boundary: the compiler assumes their code preserves its invariants,
just as it trusts their declared types. Unsupported mutations in L8 code must
be rejected rather than assumed safe.
For a pure field update, the verifier can prove the post-assignment invariant
from the old field values. For example, a guard that proves `used < len(data)`
can justify `used = used + 1`, provided the arithmetic cannot overflow.
The first implementation rejects taking the address of one of these fields,
because a later write through that pointer would bypass the field-assignment
proof. It also rejects writes through record paths the verifier cannot track.

This extends the existing field-path facts with a persistent type-level
guarantee. The current verifier already tracks relations such as
`r.used <= len(r.data)` locally and across calls with known field effects; a
record invariant differs by requiring that relation for every value of the
type, at construction and after each relevant write.

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

The verifier projects proven difference constraints at successful returns onto
the result, parameters, and stable field paths. A caller can therefore use a
returned in-bounds index, or carry a cursor relationship through
`i = advance(a, i)`. It combines multiple successful return paths by keeping
only their common bounds. Arithmetic return expressions are summarized only
when the verifier proves they cannot wrap; a `check_index` proved to fail on a
guarded path is not counted as a successful return. The projection considers
every fact at each exit, plus parameter and array-length terms, then retains
only bounds shared by all successful exits. Difference searches and reported
offsets remain bounded to keep compilation predictable. It does not yet
express these guarantees as `index_for` return
types or verify the spans used by bulk operations.

Difference-constraint searches now run in a reclaimable `region`, so their
temporary graph nodes and synthesized expressions are discarded after each
proof. Each function is analyzed under its declared and inferred entry
requirements; the verifier no longer traverses callees separately for each
caller context.

During requirement inference, a cursor assignment with an exact return offset
keeps its relationship to the function's entry cursor or a known initial
constant. If a later access needs `i + 5 < len(a)` after two six-element writes,
the compiler can infer the entry requirement `i_entry + 17 < len(a)`. It keeps
the smallest and largest offsets for each array and cursor; together they
cover the intermediate accesses. An unrelated assignment drops the cursor
relationship. Dynamic loops still need a guard or invariant that establishes
capacity for each iteration.

The verifier deliberately rejects patterns it cannot express, including some
nontrivial index arithmetic. The `--verify-bounds` flag remains opt-in while
those extensions are evaluated.

## Migration

The standard-library tests, both compiler stages, and all shipped program and
test roots now compile under `--verify-bounds`. `./build.sh all` checks these
roots in strict mode and runs the normal runtime suites. Most dynamic accesses
use an inline `check_index`; sites with a useful shared guard can call it once
before later accesses. Strict compilation remains opt-in for now, so newly
added roots should be included in the build's strict source list.

`python3 tools/check_index_migrate.py <root.l8>` reports inline checks whose
removal succeeds in an isolated strict compilation, those that need a caller
change, and those the current verifier cannot remove. It examines direct array
and field paths with a constant or named-path index. The tool copies the root's
imports into a temporary directory and tests each candidate separately, so
normal compilation stays fast and the report does not edit source files.
Use `--limit N` for a quick sample or `--file path/to/import.l8` to focus on one
import. `--apply` removes only successful candidates,
then runs `./build.sh all`; it restores the original files if that build fails.
Removing a check may strengthen the function's inferred contract, even when
all known callers already satisfy it.
