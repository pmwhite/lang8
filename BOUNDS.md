# Checked array indexing

`a[i]` checks `0 <= i < len(a)` at run time. The check applies to reads,
writes, and address-taking (`&a[i]`) on fixed arrays, slices, and strings. A
failed check exits the process with status 1, the same as the other run-time
checks:

- `memcpy`, `read`, and `write` check that each span lies inside its array.
- `new T[n](v)` rejects a negative or oversized count.
- A `match` with no matching arm exits.

Exiting is not an exception: a failed check cannot be caught, and functions do
not declare it in `raises`. A program that wants to report a bad index as an
error tests it explicitly and raises its own exception:

```l8
exception IndexOutOfBounds;

get(a: []int, i: int) raises IndexOutOfBounds: int {
    if (i < 0 || i >= len(a)) raise IndexOutOfBounds;
    a[i]
}
```

The check is one unsigned comparison of the index with the length, so a
negative index fails as well. A constant index into a fixed array that is
known to be in range has no check. The hidden terminator of a `str` is outside
its length: `s[len(s)]` fails.

## Turning the check off

`--unchecked-index` omits the check from every `a[i]` in the program:

```
l8 compile --unchecked-index file.l8 > file.s
l8 build --unchecked-index file.l8 -o file
l8 wasm --unchecked-index file.l8 -o file.wasm
l8 test --unchecked-index file.l8
```

An out-of-range index in such a program reads or writes whatever memory is at
that address. The bulk-operation checks listed above remain.

## Null pointers

`*T` is never null; `?*T` may be. The type checker enforces this without
run-time checks: a `?*T` cannot be dereferenced, have a member accessed, or be
used as a `*T` until a null test narrows it. `if (p != null)`, `while (p !=
null)`, `p != null && ...`, `p == null || ...`, and a guard that returns or
raises all narrow a local variable. Narrowing applies to variables, not to
fields; copy a field to a local before testing it:

```l8
item: ?*Item = holder.item;
if (item == null) return 0;
item.value
```

`p or fallback` unwraps an optional with a fallback value.

## History

Earlier versions proved every access at compile time with a static bounds
verifier and its `requires`, `ensures`, `invariant`, `forall`, and `index_for`
annotations. The verifier and that syntax were removed in favor of the run-time
check; both remain in the git history.
