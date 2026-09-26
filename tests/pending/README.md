These fixtures describe intended behavior that the compiler does not yet support.
They are kept outside `tests/compiler` so the ordinary suite remains green.

`bounds_numeric_join_equivalent.l8` requires a branch join to preserve equivalent
numeric facts expressed as a length guard and as a checked index. Its rejection
counterpart, `tests/compiler/bounds_numeric_join_short.l8`, remains in the active
suite. Move the positive fixture back when the shared numeric representation
supports it.

Run the pending fixture explicitly with:

```sh
python3 tools/expect.py ./l8c3 .build/expect tests/pending/bounds_numeric_join_equivalent.l8
```
