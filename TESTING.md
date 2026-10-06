# Expect tests

L8 has tests built into the language, in the style of OCaml's expect tests
and cram tests: a test prints what it observes, and the expected output sits
in the source right after the code that produced it. `l8 test` runs the tests,
shows a diff when the output differs, and `l8 test --accept` rewrites the
source with the output it saw.

## Writing tests

A test is a top-level declaration with a name and a body:

```l8
tag example;

use_tag std;

import "../stdlib/print.l8";

test "addition" {
    write_int(1, 2 + 3);
    expect {|5|}
    print("two");
    print("lines");
    expect {|
        two
        lines
    |}
}
```

`expect` checks everything the test wrote to standard output and standard
error (in the order it was written) since the previous `expect` in the same
test. Output left over when a test finishes is also a failure. A test body is
an ordinary function body: it can call anything its file can see and may raise
any exception. `expect` may appear inside loops and branches, where every run
of it must see the same output. `expect` is only valid inside a test, and test
names are unique within a program.

Put each `expect` right after the step whose output it describes, so a test
reads as a sequence of actions and their results, rather than printing
everything and checking it at the end. Print the values a step is about with
short labels; for large structures, print a summary such as a count or a
range.

A test that calls `exit` or raises an exception it does not catch ends there.
As in a cram test, the ending is part of its output, `[exit N]` or
`[raised Name]`, and the test's last `expect` records it:

```l8
test "an empty list has no first element" {
    first(empty);
    expect {|
        [raised Empty]
    |}
}
```

The expected text has three spellings, which the formatter and the runner
choose between canonically:

- `{|text|}`: one line, exactly `text`, with no trailing newline. `{||}`
  expects no output.
- A block, for output that ends with a newline. Each line is indented four
  spaces past the closing `|}`, and each ends with a newline:

  ```l8
  expect {|
      first line

      third line
  |}
  ```

- `"quoted"`, for anything else (trailing spaces, tabs, missing final
  newline on multi-line output, control bytes). It accepts the usual string
  escapes plus `\xHH`.

Tests are type-checked like other code whenever their file is
compiled, but only `l8 test` compiles them into an executable. Functions used
only by tests count as used.

## Running tests

```sh
l8 test [--accept] [-j N] file.l8 ...
```

Each file is compiled as its own program with every test in its import
graph; `main`, if present, becomes an ordinary function that tests may call.
Each test runs in its own process (with standard input at `/dev/null` and a
60-second limit), so tests cannot disturb one another's globals. Files are
built and run in parallel: under `make` the runner shares make's job slots,
and otherwise it uses every CPU, or `-j N`.

The runner prints only a summary when everything passes. A failing file gets a
report showing how its source would change, such as this one for the example
above with `expect {|6|}`:

```
FAIL tests/example.l8
@@ example.l8:9 (test "addition") @@
     write_int(1, 2 + 3);
-    expect {|6|}
+    expect {|5|}
     print("two");
1 file, 1 test, 1 failed
```

`--accept` writes those corrections back to the source files. Failures that
have no correction, such as a test that crashed, timed out, never reached an
`expect`, or saw different output on different passes through one, are
reported with the output so far and are never accepted.

The usual workflow for a new test is to write the code that prints what you
want to see, with an empty `expect {||}` after each step, run
`l8 test --accept`, and review the filled-in expectations. Output after the
last `expect` is inserted as a new one at the end of the test.

## Compiler output

The compiler's warnings and errors for a test file are part of what the file
expects. They are recorded at the end of the file, with paths relative to the
file's directory:

```l8
/* expect compile {|
error: badopen.l8:8:5: argument type mismatch: have []i8, want str
|} */
```

A file without this block expects the compiler to print nothing. A file that
fails to compile can still pass, which is how tests of compiler errors work;
its tests do not run. `--accept` records warnings anywhere, but records an
error only in a file that already has the block, so start a compile error test
with an empty one:

```l8
/* expect compile {|
|} */
```

## Cram tests

A file ending in `.t` is a cram test of command-line behavior. Lines indented
by two spaces and `$ ` are shell commands (continued by lines indented with
`> `), and the indented lines after a command are its expected output, with
standard error merged in. A final `[N]` records a nonzero exit status, and
`(no-eol)` marks output without a final newline. Every other line is
commentary.

```
The formatter drops a semicolon before a closing brace:

  $ printf 'tag a;\nmain(): int { 0; }\n' > a.l8
  $ l8 fmt a.l8
  tag a;
  
  main(): int {
      0
  }
```

The commands run in order in one shell, in an empty scratch directory, with
`l8` on `PATH` naming the compiler that runs the test and `TESTDIR` naming the
directory that holds the `.t` file. Occurrences of that directory in the
output are written as `$TESTDIR`. `l8 test` and `--accept` treat cram files
like other test files. The tests in `tests/cli/` cover the formatter, the
analysis commands, the assembler, tags, `browse`, and `l8 test` itself.
