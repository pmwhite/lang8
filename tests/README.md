# Tests

[`compiler/`](compiler/) contains self-contained language fixtures and their
expected results. [`callbacks/`](callbacks/) contains function-value and C ABI
fixtures. The comment-based runner discovers annotated `.l8` files under both
directories; [`compiler/README.md`](compiler/README.md) describes the format.

`make` runs the compiler fixtures during self-hosting. Specialized format,
browse, and analysis checks live in `tools/compiler_checks.sh`. `make callback-test`
runs the callback integration suite.
