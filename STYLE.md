# Code style

These rules guide new and changed code. Existing code is a source of examples
to examine, rather than a style precedent.

## 1. Name values for their meaning

Use descriptive words for domain concepts. Avoid unexplained abbreviations
and single-letter names when understanding them requires tracing assignments
or consulting surrounding code.

Distinguish positions, indices, counts, and units where confusion is possible:
`book_index`, `chapter_number`, `record_byte_count`.

Short names are acceptable in small scopes with an obvious meaning, such as
a simple loop index or a conventional mathematical expression.

Choose names for clarity in context; verbosity alone does not improve clarity.

## 2. Express domain decisions directly

Compare textual identifiers by their complete value. Use named constants or
variants for meaningful numeric codes. Avoid recognizing values through
unexplained character codes, selected positions, or other indirect fingerprints.

Numeric literals are fine when their meaning is apparent, such as zero
initialization or ordinary arithmetic.

## 3. Do not silently truncate data

When an operation exceeds a buffer or capacity limit, report failure or the
required capacity so the caller can respond. Do not present partial output
as a successful result.

Intentional truncation, such as shortening display text, must be explicit in
the operation's name or interface and preserve the output's validity.

## 4. Make choices readable at the call site

Avoid positional boolean flags that select operations or modes. Prefer
distinct function names, named variants, or an options record with
descriptive fields.

Booleans remain appropriate for actual yes/no data when their meaning is
clear from the call.

## 5. Make working state and dependencies explicit

Pass operation inputs as arguments and return results explicitly. When
several functions share mutable working state, group it into a context or
builder passed between them rather than communicating through unrelated globals.

Long-lived application state may be shared, but it should have a clear owner.
Keep temporary scratch state separate from it.

## 6. Handle errors with an explicit policy

Catch failures where the code can recover, translate them, or report them
meaningfully. Preserve enough context to diagnose the cause, and make failure
visible to callers when it affects their operation.

Ignore an error only when it is expected and harmless; make that reason clear.
Avoid broad catches that also hide programming errors.

## 7. Make illegal states unrepresentable

Choose types and data structures that encode the domain's invariants, so
invalid combinations cannot be constructed through normal use. Prefer
tagged variants for alternatives, keep each alternative's required data
with it, and derive redundant values rather than storing independent copies
that can disagree.

Use controlled constructors and operations to establish and preserve
invariants that the type system cannot express. Validate external data at
the boundary before admitting it into the domain model.

For example, represent a recording as Idle, Recording, or Paused rather
than independent flags that permit "paused without a recording." Keep
genuinely independent dimensions separate.

## 8. Give each shared fact one authoritative definition

Derive dependent values from that definition. When a contract crosses
language or process boundaries, share or generate its definitions rather
than maintaining matching copies by hand.

Share definitions because they represent the same fact, not merely because
their current values happen to match.

## 9. Make side effects explicit

Functions that appear to inspect or compute values should not unexpectedly
modify application state, write files, or create remote resources. Name
effectful operations for what they do.

An operation that intentionally finds or creates something should say so,
such as `ensure_bundle_registered`. Keep pure computation separate from I/O
and mutation where practical.

## 10. Use tags to define deliberate API surfaces

Give implementation declarations an internal tag, and add public tags only
to declarations intended for consumers. Use a file-level internal tag with
declaration-level public tags when a file mixes implementation and API.

Group public tags around coherent capabilities. Do not expose implementation
helpers merely to make a caller compile; first decide whether the dependency
belongs in the API.

An `_internal` suffix expresses intended use, not a security restriction.
See [tags.md](tags.md) for the language's visibility rules.

## 11. Organize modules around coherent responsibilities and deliberate contracts

Choose boundaries by deciding what a module owns, what assumptions it
maintains internally, and what guarantees it provides to callers.

Keep tightly coupled code together when shared assumptions make its
implementation clearer or more efficient. Split when distinct responsibilities
warrant independent contracts. Avoid abstractions that merely forward calls
or force internal details across a boundary.

Modules of roughly 500–3,000 lines are a useful heuristic, not a requirement.
Size alone does not justify splitting or combining modules.

## 12. Choose tag visibility deliberately

Use `tag::name` for isolated dependencies rather than enabling an entire
tag. Use `use_tag` when a coherent API is used extensively and unqualified
names remain clear.

If callers repeatedly need only one capability from a broad tag, consider
defining a focused API tag rather than expanding their visibility to
unrelated implementation details.

Qualification controls access and documents the dependency; it does not
create a namespace or remove the requirement for globally unique
declaration names.

## 13. Give cohesive modules a deliberate import entry point

Let that entry point assemble the module's implementation. Consumers should
import it and select the intended API through tags, rather than reproduce
its internal file list.

Keep platform-specific composition explicit. Share composition only where
the components form a real module with a common contract.

## 14. Expose a type's representation only when it is part of the contract

Keep implementation fields behind an internal tag when callers should
interact through operations. Expose the type's identity and supported
operations through its public API tag.

Public records are appropriate when callers are intended to inspect or
construct their data directly. Choose deliberately: exposing fields makes
their layout, meaning, and permitted mutations part of the API contract.

This rule assumes the proposed feature for tag-controlled type representation
visibility. Current tags do not yet enforce field privacy.

## 15. Write comments that explain current intent, contracts, and reasoning

Document assumptions, invariants, units, ownership, and non-obvious
implementation choices that the code alone does not communicate.

Keep comments accurate when code changes. Put change history in version
control. Avoid narrating obvious operations or preserving instructions for
work already completed.

Use references to supplement an explanation, not replace the information
needed to understand the code.

## 16. Represent coherent concepts explicitly in interfaces

When values travel together and share a purpose, lifetime, or invariant,
consider giving them a meaningful type instead of repeatedly passing their
individual parts.

Group by actual responsibility—for example, camera state, shader bindings,
or mesh resources. Avoid replacing a long parameter list with an
indiscriminate context object. Each operation should receive the concepts
it actually needs.

Parameter count is a signal to examine the contract, not a limit to satisfy
mechanically.

## 17. Define what failure leaves behind

State-changing operations should have a deliberate failure guarantee. Where
replacement should preserve the previous value on failure, prepare and
validate the replacement before committing it.

Prefer atomic replacement where appropriate. If partial changes are
possible or unavoidable, make that part of the contract and provide a way
to detect and handle them.

## 18. Fix the language and compiler instead of working around them

This repository owns its toolchain. When a compiler bug blocks correct
code, reduce it to a regression fixture and fix the compiler as part of
the work.

When a missing feature or language annoyance forces an awkward design,
stop and address the language design. Propose the improvement when its
semantics need agreement; implement it when the intended behavior is clear
and within the task's scope.

Workarounds are exceptional, temporary measures for concrete constraints
such as bootstrap compatibility. Document the constraint and removal
condition. Do not weaken correctness, obscure intent, or spread workaround
patterns through application code.

Validate toolchain changes through the required self-hosting and affected
backend checks, then use the improved language in the motivating code.

## 19. Make resource ownership and cleanup structural

Give resources a clear owner and tie cleanup to that owner's lifetime.
Make borrowing and ownership transfer explicit.

Prefer scoped cleanup that covers early returns and failures over duplicated
release sequences. Memory reclamation does not replace releasing external
resources such as files, sockets, or native objects.

## 20. Use L8 for project logic, including quick tools

When Python or shell would make a task substantially easier, identify the
missing language, library, or execution-workflow capability and address it
as part of the work.

Develop those capabilities through real tools. The goal is concise,
convenient L8 programs—not mechanical translations filled with manual
buffers, syscalls, or repeated boilerplate.

Use another language where a host environment requires it or a concrete
bootstrap constraint prevents using L8. Keep that code focused on the
required integration. Shell should primarily launch tools; substantive
processing and orchestration belong in L8.

## 21. Grow a broad, coherent library collection on demand

When a task needs a generally useful capability, create or improve an
appropriate library as part of the work. Act boldly; do not wait for
duplicated implementations or multiple callers before establishing a
useful abstraction.

Libraries need not belong to one unified standard library. Give each a
coherent purpose, deliberate contract, clear dependencies, public API tags,
and an import entry point. Keep naming and organization consistent, and
maintain a discoverable catalog.

Build from concrete needs while designing for independent use. Keep
application policy outside reusable libraries. Avoid speculative frameworks,
miscellaneous utility collections, and dependencies on the application that
first needed the capability.

## 22. Treat every human-facing interface as UX

Compiler diagnostics, command-line tools, library APIs, documentation, and
graphical applications all deserve deliberate design around the person's
goals and understanding.

Make behavior discoverable, feedback timely, and explanations actionable.
Use the vocabulary of the task. Help people understand what happened, why
it matters, and what they can do next.

Preserve work and context. Be truthful about outcomes and uncertainty.
Technical detail belongs wherever it helps the intended user reason or act.

## 23. Lead people into a pit of success

Make the natural, convenient path produce a correct and useful outcome.
Provide sensible defaults, valid construction, and complete starting points.
Build essential correctness into the interface instead of relying on
remembered instructions.

Guide people early when they depart from that path, and make recovery
straightforward. Keep advanced control available with explicit obligations
and visible costs.

Apply this to language features, library APIs, compiler workflows,
command-line tools, and graphical interfaces.
