`l8 test` builds each file with its tests, runs every test in its own
process, and compares what each test writes with the `expect` that follows.
Work in a copy of the repository layout so the standard library resolves:

  $ ln -s $TESTDIR/../../stdlib stdlib && mkdir -p tests/demo && cd tests/demo

A passing file prints nothing but the summary:

  $ cat > pass.l8 <<'EOF'
  > tag demo;
  > 
  > use_tag std;
  > 
  > import "../../stdlib/print.l8";
  > 
  > test "addition" {
  >     print_int(2 + 3);
  >     expect {|
  >         5
  >     |}
  > }
  > EOF
  $ l8 test pass.l8
  1 file, 1 test

A wrong expectation is shown as a diff against the source, and output left at
the end of a test becomes a new expectation:

  $ cat > fail.l8 <<'EOF'
  > tag demo;
  > 
  > use_tag std;
  > 
  > import "../../stdlib/print.l8";
  > 
  > test "steps" {
  >     print("one");
  >     expect {|
  >         uno
  >     |}
  >     print("two")
  > }
  > EOF
  $ l8 test fail.l8
  FAIL fail.l8
  @@ fail.l8:10 (test "steps") @@
       expect {|
  -        uno
  -    |}
  -    print("two")
  +        one
  +    |}
  +    print("two");
  +    expect {|
  +        two
  +    |}
   }
  1 file, 1 test, 1 failed
  [1]

`--accept` writes the corrections, after which the file passes:

  $ l8 test --accept fail.l8 > /dev/null; sed -n '/^test/,$p' fail.l8
  1 file, 1 test
  test "steps" {
      print("one");
      expect {|
          one
      |}
      print("two");
      expect {|
          two
      |}
  }
  $ l8 test fail.l8
  1 file, 1 test

Expected text is written as `{||}` when empty, `{|text|}` for one line without
a newline, an indented block for lines that end with newlines, and a quoted
string with escapes for anything else:

  $ cat > forms.l8 <<'EOF'
  > tag demo;
  > 
  > use_tag std;
  > 
  > import "../../stdlib/print.l8";
  > 
  > test "forms" {
  >     expect "stale"
  >     write(1, "no newline");
  >     expect {||}
  >     print("line");
  >     expect {||}
  >     write(1, "tab\there");
  >     write_byte(1, 27i8);
  >     write(1, "\n  trailing space \n");
  >     expect {||}
  > }
  > EOF
  $ l8 test --accept forms.l8 > /dev/null; sed -n '/^test/,$p' forms.l8; l8 test forms.l8
  1 file, 1 test
  test "forms" {
      expect {||}
      write(1, "no newline");
      expect {|no newline|}
      print("line");
      expect {|
          line
      |}
      write(1, "tab\there");
      write_byte(1, 27i8);
      write(1, "\n  trailing space \n");
      expect "tab\there\x1b\n  trailing space \n"
  }
  1 file, 1 test

An uncaught exception or a call to exit ends a test early. As in a cram test,
how it ended is part of the output that the last expectation records:

  $ cat > endings.l8 <<'EOF'
  > tag demo;
  > 
  > use_tag std;
  > 
  > import "../../stdlib/print.l8";
  > 
  > extern exit(code: int): noreturn;
  > 
  > exception Broken;
  > 
  > test "raises" {
  >     print("before");
  >     raise Broken
  > }
  > 
  > test "exits" {
  >     exit(4)
  > }
  > EOF
  $ l8 test --accept endings.l8; sed -n '/^test/,$p' endings.l8
  accepted endings.l8
  @@ endings.l8:13 (test "raises") @@
       print("before");
  -    raise Broken
  +    raise Broken;
  +    expect {|
  +        before
  +        [raised Broken]
  +    |}
   }
  @@ endings.l8:17 (test "exits") @@
   test "exits" {
  -    exit(4)
  +    exit(4);
  +    expect {|
  +        [exit 4]
  +    |}
   }
  1 file, 2 tests
  test "raises" {
      print("before");
      raise Broken;
      expect {|
          before
          [raised Broken]
      |}
  }
  
  test "exits" {
      exit(4);
      expect {|
          [exit 4]
      |}
  }

An expectation that a test never reaches cannot be corrected, nor can one that
sees different output on different passes through a loop:

  $ cat > unreached.l8 <<'EOF'
  > tag demo;
  > 
  > use_tag std;
  > 
  > import "../../stdlib/print.l8";
  > 
  > test "branches" {
  >     for i in 0..2 {
  >         print_int(i);
  >         expect {|
  >             0
  >         |}
  >     }
  >     if (false) {
  >         expect {||}
  >     }
  > }
  > EOF
  $ l8 test --accept unreached.l8
  FAIL unreached.l8
  unreached.l8:10: expect saw different output on different runs
  unreached.l8:15: expect was not reached
  1 file, 1 test, 1 failed
  [1]

Compiler warnings are part of a file's expected output, recorded at the end of
the file:

  $ cat > warning.l8 <<'EOF'
  > tag demo;
  > 
  > test "unused" {
  >     value: int = 1
  > }
  > EOF
  $ l8 test --accept warning.l8 > /dev/null; cat warning.l8; l8 test warning.l8
  1 file, 1 test
  tag demo;
  
  test "unused" {
      value: int = 1
  }
  
  /* expect compile {|
  warning: warning.l8:4:5: unused local value in test "unused"
  |} */
  1 file, 1 test

A compile error is accepted only into a file that already expects compiler
output, so a broken edit is never recorded as the expected result:

  $ printf 'tag demo;\n\ntest "broken" {\n    missing()\n}\n' > broken.l8
  $ l8 test --accept broken.l8
  FAIL broken.l8
  the file does not compile:
    | error: broken.l8:1:1: unknown function missing
  1 file, 0 tests, 1 failed
  [1]
  $ printf '\n/* expect compile {|\n|} */\n' >> broken.l8
  $ l8 test --accept broken.l8 > /dev/null; l8 test broken.l8; tail -n 3 broken.l8
  1 file, 0 tests
  1 file, 0 tests
  /* expect compile {|
  error: broken.l8:1:1: unknown function missing
  |} */

`expect` belongs to tests, and each test needs its own name:

  $ printf 'tag demo;\n\nmain(): int {\n    expect {||}\n    0\n}\n' > outside.l8
  $ l8 compile outside.l8
  error: outside.l8:4:14: expect is only allowed in a test
  [1]
  $ printf 'tag demo;\n\ntest "same" { }\n\ntest "same" { }\n' > twice.l8
  $ l8 compile twice.l8
  error: twice.l8:5:7: duplicate test name
  [1]

Cram files run their commands in a scratch directory with `l8` on the path;
`[N]` records a nonzero exit status:

  $ printf 'Commands:\n\n  $ echo hi\n  $ false\n' > demo.t
  $ l8 test --accept demo.t > /dev/null; cat demo.t
  1 file, 2 tests
  Commands:
  
    $ echo hi
    hi
    $ false
    [1]
