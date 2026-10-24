# Tests

Language fixtures and CLI cram tests run with `l8 test` (see
[`TESTING.md`](../TESTING.md)); `make compiler-test` runs them during
compiler validation. C interoperability also has a separate runner:

- [`compiler/`](compiler/) holds language and compiler fixtures; see
  [`compiler/README.md`](compiler/README.md).
- [`callbacks/`](callbacks/) holds function-value and C ABI fixtures. `make
  callback-test` also builds them against a C library with a host C compiler.
- [`cli/`](cli/) holds cram tests of the command line: the formatter, the
  analysis commands, the assembler, tags, `browse`, and `l8 test` itself.
