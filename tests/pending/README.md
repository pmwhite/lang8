These fixtures describe intended behavior that the compiler does not yet support.
They are kept outside `tests/compiler` so the ordinary suite remains green.

The numeric branch-join fixture now lives in `tests/compiler`; the shared
difference domain supports both its accepting and rejecting cases.

`bounds_guarded_positive_offset.l8` records a deliberate regression from the
numeric-domain simplification: guarded positive-offset accesses need general
range/no-wrap reasoning to avoid an unnecessarily strong inferred entry contract.
