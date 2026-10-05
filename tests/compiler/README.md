# Compiler tests

Each `.l8` file here is an `l8 test` file (see [`TESTING.md`](../../TESTING.md)).
`make` runs every file under `tests/compiler`, `tests/callbacks`, and the cram
tests in `tests/cli`; adding a file needs no build entry. Helper files that
other fixtures import run too, so they must also compile cleanly.

A fixture that runs code puts it in a `test` and prints what it observes.
Many older fixtures keep a `main` that returns a status, with a test that
calls it:

```l8
test "main" {
    status: int = main();
    std::write(1, "main returned ");
    std::print_int(status);
    expect {|
        main returned 0
    |}
}
```

A fixture for a compiler diagnostic ends with the exact output it expects,
paths relative to this directory. Warnings in a fixture that runs are recorded
the same way:

```l8
/* expect compile {|
error: badopen.l8:8:5: argument type mismatch: have []i8, want str
|} */
```

A few fixtures keep their expectation elsewhere because the end of the file is
part of the test: `unterminated_comment.l8` puts it first, since the comment
under test would swallow it. The fixtures for `main(argc, argv)` entry facts
have no test, because a call from a test would not get the runtime's argv
guarantees; `l8 test` still checks that they compile.

Run some or all of the fixtures from the repository root:

```sh
./l8 test tests/compiler/hello.l8
./l8 test $(find tests/compiler tests/callbacks -name '*.l8') tests/cli/*.t
./l8 test --accept tests/compiler/hello.l8
```

The bounds fixtures cover proof-required indexing, unreachable accesses,
loop revisits, address-taking, and nested accesses. Older bounds-failure
fixtures deliberately retain unproved `[]`; declaring or catching
`IndexOutOfBounds` does not authorize them. A separate fixture verifies that
the removed runtime-check syntax is rejected.
