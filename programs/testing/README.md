# Inline library expect tests

Library tests can record several output checkpoints in one L8 program. Place
a JSON string expectation comment after the output it should capture:

```l8
write(1, result, len(result));
//% expect: "answer\n"
```

The compiler's `build --expect` mode inserts checkpoints at these comments.
Each one compares the stdout written since the previous checkpoint.
The program must exit successfully, reach every checkpoint in source order,
and leave no output after the last checkpoint. Stderr must be empty unless the
file has one `//% stderr: "..."` comment with its exact expected contents.
The markers include source positions, so missing or reordered checkpoints
fail. Existing assertions can still check properties and error paths.

Run `python3 tools/lib_expect.py path/to/test.l8 --compiler ./l8c3` from the
repository root, or use `--discover path/to/tests` to run all L8 files with
expectations under a directory. Add `--accept` to update changed strings after
a successful run, then review the source diff. `build.sh` discovers library
tests for the standard library, HTTP, WebSocket, terminal, and the headless
block game. The Python runner only builds, executes, and compares L8 programs;
test logic stays in L8.
