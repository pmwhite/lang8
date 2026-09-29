# Verified array indexing

L8 distinguishes proven and checked indexing at each access site:

- `a[i]` requires a proof of `0 <= i < len(a)` and emits no runtime bounds check.
- `a![i]` performs a runtime check and raises `IndexOutOfBounds` if it fails.
  The containing function must declare `raises IndexOutOfBounds`, or a matching
  `try`/`with` arm must catch it.

A function-wide `raises` declaration never permits an unproved `[]` access.
The same syntax applies to reads, writes, address-taking, fixed arrays, slices,
and strings. Checked access has ordinary indexing precedence: `&a![i]` and
`rows![i]![j]` are valid.

A redundant `![]` produces a warning recommending `[]`; it remains valid and
still emits its explicit runtime check. Diagnostics use final validation after
summary inference, combine all reachable visits to a site, and ignore unreachable
accesses. Improving a proof can therefore introduce a warning without making an
explicitly checked program invalid.

Ordinary control flow can establish the fact: a guard may return or raise when
the index is invalid, and code after the guard may index the array without an
exception effect.

The programmer-facing concept is `index_for(a)`: an integer valid for a particular
array value. A function can take or return such an index. Its callers may satisfy
the requirement through a guard, a loop, a constructively valid index, or their
own parameter requirement. Explicit contracts can state an entry requirement;
`[]` may also infer such a requirement from parameter paths. If neither local
facts nor a caller obligation establish the proof, the access needs `![]` and
the exception effect.

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

Top-level scalar values can be declared with `const NAME: T = expression;`
for `int`, `i8`, `i32`, `u32`, `bool`, `f32`, and `f64`. The initializer must be a
compile-time expression of literals and previously declared constants; floating point
arithmetic in a const initializer is not yet supported. Const globals have no
writable storage: assignment and address-taking are errors. Integer const values
can be used in array sizes, loop bounds, contracts, and record invariants, so a
size such as `WIND_CELLS` retains its numeric meaning in a bounds proof.
Ordinary globals remain mutable and cannot be treated as constants by the verifier.

Start with array, slice, and string indexing. Apply the same mechanism to spans
and bulk operations where it stays simple. Keep compilation fast and predictable;
diagnostics should make a missing guard, contract, or invariant apparent.

Inspiration: the Index Checker's array-relative types, Pentagons' lightweight
range reasoning, and Wuffs' requirement for a compile-time proof of each access.

## Initial implementation

Both compiler stages and the saved bootstrap verify bounds during every `compile` and `build`. It rejects unproved
`[]` accesses and emits runtime checks only for `![]` accesses. A checked access
needs `raises IndexOutOfBounds` on its function or a matching `try`/`with` arm. After a successful read or write, the verifier can use the checked index bounds
on the normal continuation. This can justify a later contract call or count
update. These facts are attached to source paths only when evaluating the index
cannot mutate those paths.

`index_for` is a reserved keyword. `i: index_for(a)` declares a function parameter
whose value is valid for array parameter `a`. Explicit contracts and `index_for`
parameters carry this requirement through ordinary calls.
For a two-argument `main(int, []str)` that is not called or address-taken by
source code, the verifier knows the runtime supplies `argc == len(argv)`.
Functions receiving a count and slice separately can declare a `requires`
relationship, which ordinary callers must prove.
A function can state an entry contract after its return type:

```l8
advance(a: []int, n: int): int requires (0 <= n && n <= len(a)) {
    if (n == len(a)) return n;
    a[n] = 1;
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

A proof-required access to an array parameter or its direct field can infer
an entry requirement. For example, `a[5]` requires callers to prove
`len(a) >= 6`. Checked accesses never infer these requirements. An explicit
`requires` clause can also make an access proved, and direct callers must
establish both explicit and inferred requirements. Writes that invalidate a
required fact discard it within the callee, so an entry requirement does not
justify an access after such a write.

Length comparisons also carry relationships between local arrays: after
`len(a) == len(b)`, a loop over `a` can index `b` while both lengths remain
stable. A range loop over `len(record.field)` can index that field when its body
has no calls or writes that could change the field's length. The verifier keeps
facts entering range and collection loops only while their bodies preserve them.

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
guard such as `if (a == b) return`, and a function can declare an exception
effect for an unproved access after the call. An unproved contract call is
rejected. Nested paths and
unknown aliases remain conservative. Automatically inferred cross-function
count/capacity requirements remain future work; the explicit record invariants
below provide a durable relationship when a type declares one.

Copying a stable value also copies its proved inequalities and the numeric or
length properties of its field paths, so `first = r.count` retains `first <= len(r.items)` when later
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

Explicit checked indexing (`a![i]`) is the runtime bridge. If the verifier cannot prove an index,
the generated code checks `0 <= i < len(a)` and raises `IndexOutOfBounds` on
failure. A guard can establish a reusable fact for later accesses or satisfy
an `index_for(a)` parameter:

```l8
if (i < 0 || i >= len(a)) raise IndexOutOfBounds;
use(a[i]);
```

The verifier projects proven difference constraints at successful returns onto
the result, parameters, and stable field paths. A caller can therefore use a
returned in-bounds index, or carry a cursor relationship through
`i = advance(a, i)`. It combines multiple successful return paths by keeping
only their common bounds. Arithmetic return expressions are summarized only
when the verifier proves they cannot wrap; a path that raises is not counted as a successful return. The projection considers
every fact at each exit, plus parameter and array-length terms, then retains
only bounds shared by all successful exits. Difference searches use a bounded work queue, and reported offsets remain
bounded to keep compilation predictable. It does not yet
express these guarantees as `index_for` return
types or verify the spans used by bulk operations.

Difference-constraint searches run in a reclaimable `region`. Their temporary
integer tables are discarded after each proof; searches do not construct AST
expressions or allocate individual graph nodes and edges. Each function is
analyzed under its declared entry requirements; the verifier no longer
traverses callees separately for each caller context.

Unproved index arithmetic requires `![]` and the exception effect. A guard or loop invariant
can establish capacity when an effect-free access is needed.

## Migration

The compiler sources and active standard-library, compiler, block-game, and
terminal fixtures use the checked/proven distinction. `./build.sh all` runs the compiler
and runtime suites. Dynamic accesses use `![]` and declare the exception effect where the verifier
cannot prove their bounds. The verifier has been promoted to both source stages
and the saved bootstrap. During migration, stage 1 accepted `![]` as legacy
indexing while stage 2 enforced the distinction. Site-specific warnings marked
unproved accesses before unproved `[]` became an error.


## Checker architecture

The stage-2 checker is split into a language adapter and a proof engine. The old
`src2/bounds.l8` has been replaced by these modules:

| Module | Responsibility |
| --- | --- |
| `bounds_model.l8` | Shared schemas and named fact kinds |
| `bounds_terms.l8` | Term identity, arithmetic safety, numeric lowering |
| `bounds_state.l8` | Indexed fact tables, snapshots, joins, loop widening |
| `bounds_solver.l8` | Interned terms and difference-constraint work queue |
| `bounds_effects.l8` | Mutation dependencies, alias obligations, effect propagation |
| `bounds_contracts.l8` | Entry requirements and caller obligations |
| `bounds_records.l8` | Record invariant construction and update obligations |
| `bounds_returns.l8` | Successful-exit projection and return-value application |
| `bounds_flow.l8` | Expression and statement transfer rules |
| `bounds_driver.l8` | Call components, inference, and final validation |

Control flow has an explicit unreachable state, distinct from a reachable state
with no known facts (`null`). Returns, raises, and expressions of type `noreturn`
terminate the normal continuation. Branch and match joins use only reachable
predecessors; loop preservation obligations apply only to reachable back edges.
Successful-return projection and fallthrough guarantees use this same state
instead of a separate syntactic divergence test. Short-circuit expressions
conservatively merge a live skipped edge using its entry facts, avoiding copies
of large states for both complementary predicates. A sole surviving edge is
refined; literal tests retain facts from an unconditionally evaluated operand.

Each active catch handler accumulates exceptional predecessors. An explicit
raise sends its state to the nearest matching handler; a direct call sends its
state after effect invalidation to handlers for its declared exceptions. Unknown
calls conservatively notify all active handlers. An explicit checked index sends the
state before its successful-check facts to the `IndexOutOfBounds` handler. Normal
try exits and reachable handler exits then join in the usual way. During summary
inference, only explicit checked accesses contribute index-exception edges.
Checking whether an explicit check is redundant must not infer additional entry
requirements. Proven accesses may infer parameter requirements that callers must prove; they are
validated as obligations after inference. When a scalar is overwritten, the verifier
preserves consequences between surviving values by composing unconditional
difference bounds through its old value before forgetting it.

A local boolean initialized from a pure condition retains the numeric facts
implied by either result. For example, a false `i >= len(a) || a[i] == 0`
implies `i < len(a)` when that boolean is tested later. These conditional
facts are discarded when a write or call could change their inputs. Range
loops bounded by `len` of a nested field also carry that length fact when
the loop body preserves every field in the path.

After an access at `a[i + k]` succeeds, a nonnegative `i` with positive `k`
is also in bounds. The verifier carries this fact across the normal edge of
both checked and proved accesses, and discards it if the array changes.

Pure difference entailment also avoids inserting redundant successful-check
facts; it never uses edges requiring additional alias assumptions.
Direct numeric lookup returns evidence (a bound and any separation assumptions)
without modifying contracts. Numeric proof consumers explicitly commit the
assumptions they use; lattice operations use unconditional or matching evidence
and never commit assumptions. Higher-level proof routines still perform this
commitment, so a Boolean proof helper is not generally a pure entailment query.

The adapter still represents values using source paths. In particular, an index
expression that may mutate the array path keeps its runtime check, since the
array value was evaluated before the index. General immutable evaluated values
and a unified predicate representation remain separate follow-up work.

Facts occupy contiguous row tables. A state is an immutable prefix of a shared
append-only buffer. Appending at the newest prefix reuses capacity; extending
an older branch copies its prefix. Hash buckets index canonical term pairs, so
a direct proof or join does not scan every fact. Buckets can include newer rows
from a sibling branch: **every reader must enforce the snapshot's row count**.
Copies with the same bucket count preserve the prefix links and trim bucket
heads past the snapshot count; chains always point to older rows. Copies with
a different bucket count rebuild the index. Unchanged rows reuse their cached
numeric descriptors. Duplicate rows do not extend the state.

Hot call-preservation scans borrow the row slice and snapshot count once.
Prefix copying validates the source and destination lengths before entering
the loop, allowing proved indexing inside it. Direct evidence borrows the
numeric slice and hash chains once, but still filters every candidate against
the snapshot count; newer sibling rows never become evidence.

A cached numeric descriptor contains two embedded 24-byte term references, a
bound, and a separation pointer (64 bytes total). Term validity uses existing
padding in each reference. Both endpoints must be valid for a numeric query.
Hashing, direct evidence, and solver queries borrow descriptors or endpoints
instead of repeatedly assembling and copying them. A variable term caches its
object identity alongside its source path; the path remains available for
known lengths and AST export. Call filtering uses that identity for variables
and lengths of variables, reading current local/escape flags rather than
caching their classification. Other terms retain the AST classification.
Graph loading retains terms from the source
state, while borrowed descriptor pointers themselves never enter a graph.

The driver owns a size-classed pool of fact buffers. It recycles them only after
an entire function inference pass, strict function check, or global initializer
check finishes. No live state may cross that boundary. Published summaries copy
rows by value and retain AST terms allocated outside the pool; neither those
terms nor the summaries are reclaimed. Standalone engine states can still omit
the pool. This reduces allocation without changing snapshot or proof semantics.

Numeric graph construction already uses lexical `region` blocks. Join projection
now shares two distance arrays and a queue across its source searches within that
region, exporting only scalar weights. Whole-function regions are not yet safe:
summary terms escape and analysis also uses `noregion` operations. The buffer pool
therefore recycles only the storage whose lifetime the driver can establish.
Implication-only states also no longer allocate an unused row table.

Numeric facts have one meaning: `left - right <= bound`. Small constants fold
into the bound on insertion, and strict comparisons subtract one. Every numeric
row has the same `Difference` kind; only separation, freshness, and cursor
provenance use other kinds. Numeric lookup, copying, invalidation, and branch
joins share this representation. Thus length guards and
successful checked accesses can contribute the same fact at a join. Two different
bounds for the same pair join at the weaker bound. Copying a returned or joined
integer preserves its relations to other stable values.

Assignments, guards, and scalar returns share affine normalization and the same
no-wrap proof. A safe `j = i + c` emits the two ordinary difference edges for
that equality; a self-update shifts existing edges instead of reinterpreting
the right-hand side with the new value. Symbolic remainder and mask ranges also
lower to difference edges: a nonnegative remainder is below its positive
divisor, and masking with a nonnegative value produces a result between zero
and that value. Inline index proofs use the same symbolic range helper.

Stable copies rebase existing paths onto the destination. Freshness tokens are
copied with pointer aliases; a write preserves another object's field facts
only when the actual field owners are proved separate. Different parent
objects do not imply separate children. Constructor facts retain only constants
from initializers preceding a possible mutation, since later initializers may
change the paths used by earlier ones.

Successful-return summaries use the same candidate enumeration, difference
queries, and call-site transfer for scalars, slice lengths, and numeric or
length properties of returned records. A stable synthetic result path replaces
the old direct-constructor shortcut. Result paths are limited to three member
steps, and summary bounds retain the existing conservative 64-unit limit;
larger constant lower bounds weaken to 64 and larger upper bounds are omitted.
Relations such as `len(result) = n` have offset zero and do not limit the actual
value of `n`.

When a direct branch join loses facts from both predecessors, the solver also
projects common implications onto at most eight shared terms. It builds each
predecessor's graph once and reuses each source search for all selected targets.
This recovers relationships reached through different intermediate variables
without requiring an unbounded all-pairs closure. The limit affects precision,
not validity.

Projection searches also stop when they find a negative distance back to their
own source: a real closed walk proving `source - source <= -1`. Because graph
edges carry no unresolved separation assumptions, this certifies that the
predecessor is impossible. The join retains the other predecessor's complete
snapshot, including its implications, rather than exporting bounds that depend
on how many times a negative cycle ran before the budget expired. Zero-weight
cycles are not contradictions. This is opportunistic detection using the same
selected sources, not a complete negative-cycle scan; the ordinary search
budget and fallback remain in place when no certificate is found.

Loop back edges use a separate widening operation. Only previous header facts
that remain valid survive; an increasing sequence of cursor maxima is dropped.
Each changing iteration removes a header fact, giving finite convergence without
an arbitrary loop-iteration cap. Guards and declared invariants can still
establish stronger facts inside the loop body.

The transitive solver interns zero, paths, and lengths into integer IDs using a
hash table. Each adjacency entry stores its target, weight, and next-edge index
together; distances and the work queue use flat arrays. An edge from `right`
to `left` has weight `bound`. Every length has an
implicit edge to zero. Work is bounded by `64 * (nodes + edges + 1)`, capped at
262,144 edge visits. Exhausting this budget loses possible proofs; every finite
distance still represents an actual path. Out-of-range distances are discarded
rather than saturated. Alias-dependent edges stay out of transitive searches
until the solver can carry their proof obligations.

A length absent from a cached graph has only its implicit edges through zero.
For small edge weights and offsets, a query can use the cached distance to or
from zero plus that offset. This retains no query-owned AST pointers in the
cache. Large weights, large offsets, and incomplete searches that have not
proved the query retain the query-local fallback. The weight bound ensures that
translation cannot change which paths cross the search's distance sentinel.

Join projection keeps normalized term references through its redundancy checks.
It materializes AST expressions only when a projected relation adds a new fact.

Scalar equality closure keeps a dense list of reached equality-row indices.
Membership checks visit only those rows, and each row joins the class at most
once. The fixed-point scan still follows transitive chains in any insertion
order and stays within the original snapshot.

Effect inference scans each body once, then propagates summaries through a
reverse call-site table. Only callers of changed summaries reenter the work
queue. Calls preserve local scalar and slice facts when the local's address has
not escaped; dereferenced memory and record fields require effect reasoning.
Read-only direct calls with side-effect-free arguments are allowed in proof
conditions, so a conjunct such as `p < len(s)` survives a character-classifier
call. Read-only classification requires no unknown, field, or element writes;
element-write effects propagate through the same call-site work queue.
Contract inference still follows call components, including recursive groups.

To extend the checker, lower a new safe arithmetic or control-flow rule into the
numeric domain when possible. Add a separate fact kind only for information the
difference domain cannot represent, such as freshness or cursor provenance.
Each extension must specify mutation dependencies, branch-join behavior, and
loop-widening behavior. A new proof must respect machine arithmetic and the
identity of the values checked; no rule may turn a runtime check into an assumed contract.

`tests/compiler/bounds_engine_tables.l8` compares the solver with an independent
all-pairs reference on 40 feasible generated graphs with negative edges. It also
checks hash collisions, shared-buffer branch isolation, weaker joins, widening,
long chains, pool reuse without stale facts, summary-row survival after reuse,
and bounded handling of a disconnected negative cycle. The ordinary
bounds fixtures exercise the language adapter and include both accepting and
rejecting counterparts. The formerly pending equivalent-numeric-join fixture is
now in the active suite.

For repeatable timing on the same source with two compiler binaries:

```sh
python3 tools/bench_bounds.py ./l8c3 --baseline /path/to/previous/compiler
```

The default workload is the unchanged `src1/main.l8`; `--root` selects other
roots and may be repeated. The tool reports median wall time and summed bounds
phase time, and fails if either compiler rejects a workload. A seven-run median
comparison of these extensions against `b65d519` on `src1/main.l8` measured
about 189 ms versus 109 ms for bounds analysis (268 ms versus 188 ms wall time).
The additional proofs currently increase analysis time by about 73% on this
workload. The multi-source no-wrap search and bounded join projection keep the
new work finite, but this remains a performance cost to improve. Timings vary
with the machine and source revision.

Further experiments against `28c1e8b` tried linked branch deltas, shared fact
chunks, immutable-state graph/source caches, and deferred join projection. They
passed the compiler fixtures but increased elapsed analysis time on the compiler
and game workloads, so they are not retained. The linked-delta variant reduced
game peak RSS from roughly 480 MiB to 357 MiB but increased bounds time by about
one third. Chunk sharing reduced that slowdown, but remained slower than dense
tables. Graph caching and deferred projection did not reverse it. These are
workload-specific trial results, not a claim that those approaches cannot help
with a different representation or workload.

The retained buffer pool and region-local search workspace reduced game peak
RSS from 495,656 KiB to 443,824 KiB (about 10%). An alternating-order five-run
comparison measured 1,339 ms versus 1,337 ms for game bounds analysis, and
1,431 ms versus 1,428 ms wall time: effectively unchanged. A seven-run compiler
comparison measured 183 ms versus 185 ms bounds time and 293 ms versus 292 ms
wall time. These changes are a memory improvement; they do not establish a
speedup. Measure RSS separately with `/usr/bin/time -v ./l8c3 compile <root>`;
use identical roots and alternate binary order when checking small timing
changes against machine noise.

Index accesses, count obligations, guards, and invariant checks use the same
difference queries. Machine-arithmetic range analysis remains separate: masks,
products, and overflow checks cannot all be represented by difference edges.
Joins and widening use pure entailment; proof queries may additionally discharge
alias-separation obligations and record them in inferred contracts.

The old positive-offset guard shortcut is intentionally removed. The shared
arithmetic rules may prove guarded lookahead; other accesses use the exception
effect. Recover missing proofs through general range/no-wrap reasoning rather
than a separate array-offset fact kind.
