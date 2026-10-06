The formatter prints one canonical layout. Formatting its own output changes
nothing, and the formatted program passes the same tests. Fixtures import the
standard library by relative path, so work in a copy of the repository layout:

  $ ln -s $TESTDIR/../../stdlib stdlib && mkdir -p tests/compiler && cd tests/compiler

Integer match arms:

  $ l8 fmt $TESTDIR/../compiler/intmatch.l8 > intmatch.l8
  $ cat intmatch.l8
  tag example;
  
  import "../../stdlib/print.l8";
  
  integer_case(n: int): int {
      match n {
          -7 -> 1;
          4294967296 -> 2;
          _ -> 3
      }
  }
  
  character_case(c: i8): int {
      match c {
          'A' -> 4;
          '\n' -> 5;
          255 -> 6;
          _ -> 7
      }
  }
  
  wide_case(n: u32): int {
      match n {
          4294967295 -> 8;
          _ -> 9
      }
  }
  
  signed_case(n: i32): int {
      match n {
          -17 -> 10;
          _ -> 11
      }
  }
  
  statement_case(n: int): int {
      result: int = 0;
      match n {
          4 -> result = 12;
          _ -> result = 13
      }
      result
  }
  
  early_case(n: int): int {
      match n {
          1 -> return 14;
          _ -> { }
      }
      15
  }
  
  main(): int {
      if (integer_case(-7) != 1 || integer_case(4294967296) != 2 || integer_case(0) != 3) return 1;
      if (character_case('A') != 4 || character_case('\n') != 5 || character_case(255i8) != 6 || character_case('z') != 7) return 2;
      if (wide_case(4294967295u32) != 8 || wide_case(0u32) != 9) return 3;
      if (signed_case(-17i32) != 10 || signed_case(0i32) != 11) return 4;
      if (statement_case(4) != 12 || statement_case(5) != 13) return 5;
      if (early_case(1) != 14 || early_case(2) != 15) return 6;
      0
  }
  
  test "main" {
      status: int = main();
      std::write(1, "main returned ");
      std::print_int(status);
      expect {|
          main returned 0
      |}
  }
  $ l8 fmt intmatch.l8 | cmp - intmatch.l8
  $ l8 test intmatch.l8
  1 file, 1 test

Match arms with one expression or return lose their braces; arms that scope a
declaration or carry a comment keep them:

  $ l8 fmt $TESTDIR/../compiler/match_format.l8 > match_format.l8
  $ cat match_format.l8
  tag example;
  
  import "../../stdlib/print.l8";
  
  type Choice =
      | Value { data: int }
      | Empty
  
  value(c: Choice): int {
      match c {
          Value v -> v.data;
          Empty -> 0
      }
  }
  
  early(n: int): int {
      match n {
          1 -> return 9;
          _ -> return 10
      }
      0
  }
  
  scoped(c: Choice): int {
      match c {
          Value v -> {
              v: int = 7
          }
          Empty -> { }
      }
      0
  }
  
  commented(n: int): int {
      match n {
          1 -> {
              // Keep this comment with its block.
              3
          }
          _ -> 4
      }
  }
  
  main(): int {
      c: Choice = Choice.Value { data: 5 };
      if (value(c) != 5 || early(1) != 9 || early(2) != 10 || scoped(c) != 0 || commented(1) != 3 || commented(2) != 4) return 1;
      0
  }
  
  test "main" {
      status: int = main();
      std::write(1, "main returned ");
      std::print_int(status);
      expect {|
          main returned 0
      |}
  }
  
  /* expect compile {|
  warning: match_format.l8:27:13: unused local v in scoped
  warning: match_format.l8:26:15: unused local v in scoped
  |} */
  $ l8 fmt match_format.l8 | cmp - match_format.l8

The formatted program passes its tests; only the warning locations move:

  $ l8 test match_format.l8
  1 file, 1 test

Control statements with one simple body lose their braces, unless the braces
protect a nested if or carry a comment:

  $ l8 fmt $TESTDIR/../compiler/control_format.l8 > control_format.l8
  $ cat control_format.l8
  tag example;
  
  import "../../stdlib/print.l8";
  
  main(): int {
      value: int = 0;
      if (true) value = 1 else value = 2;
      while (false) value = 9;
      for i in 0..1 value = value + i;
      if (false) {
          if (true) value = 9
      } else value = value + 1;
      if (true) local: int = value;
      if (true) {
          // Keep this comment with its block.
          value = value + 1
      }
      if (value != 3) return 1;
      0
  }
  
  test "main" {
      status: int = main();
      std::write(1, "main returned ");
      std::print_int(status);
      expect {|
          main returned 0
      |}
  }
  
  /* expect compile {|
  warning: control_format.l8:13:15: unused local local in main
  |} */
  $ l8 fmt control_format.l8 | cmp - control_format.l8
  $ l8 test control_format.l8
  1 file, 1 test

Index expressions, including addresses of elements and nested indexing:

  $ l8 fmt $TESTDIR/../compiler/index_forms.l8 > index_forms.l8
  $ grep -F -e '&a[i]' -e 'row[j]' index_forms.l8
      row[j]
      slot: *int = &a[i];
  $ l8 fmt index_forms.l8 | cmp - index_forms.l8
  $ l8 test index_forms.l8
  1 file, 1 test

Semicolons are optional after a block, before `}` or `else`, at the end of the
file, and between match arms; the formatter drops the optional ones:

  $ cat > optional-semi.l8 <<'EOF'
  > tag example;
  > 
  > exception Stop;
  > type Choice = | A | B
  > 
  > id(): int { return 3 }
  > done() { if (true) return else return }
  > stop() raises Stop { raise Stop }
  > 
  > main(): int {
  >     value: int = 0;
  >     { value = value + 1 }
  >     { scratch: int = 1 }
  >     if (false) value = 9 else value = value + 1;
  >     while (false) { value = 9 }
  >     for i in 0..0 { value = 9 }
  >     match value { 2 -> value = value + 1; _ -> value = 9 }
  >     if (value != id()) return 1;
  >     0
  > }
  > 
  > test "main" {
  >     std::print_int(main())
  >     expect {|
  >         0
  >     |}
  > }
  > 
  > import "../../stdlib/print.l8"
  > 
  > /* expect compile {|
  > warning: optional-semi.l8:16:9: unused local i in main
  > warning: optional-semi.l8:13:7: unused local scratch in main
  > warning: optional-semi.l8:6:13: unnecessary return in id
  > |} */
  > EOF
  $ l8 fmt optional-semi.l8
  tag example;
  
  exception Stop;
  
  type Choice =
      | A
      | B
  
  id(): int {
      return 3
  }
  
  done() {
      if (true) return else return
  }
  
  stop() raises Stop {
      raise Stop
  }
  
  main(): int {
      value: int = 0;
      {
          value = value + 1
      }
      {
          scratch: int = 1
      }
      if (false) value = 9 else value = value + 1;
      while (false) value = 9;
      for i in 0..0 value = 9;
      match value {
          2 -> value = value + 1;
          _ -> value = 9
      }
      if (value != id()) return 1;
      0
  }
  
  test "main" {
      std::print_int(main());
      expect {|
          0
      |}
  }
  
  import "../../stdlib/print.l8"
  
  /* expect compile {|
  warning: optional-semi.l8:16:9: unused local i in main
  warning: optional-semi.l8:13:7: unused local scratch in main
  warning: optional-semi.l8:6:13: unnecessary return in id
  |} */
  $ l8 test optional-semi.l8
  1 file, 1 test

A declaration at the end of the file keeps no semicolon:

  $ for declaration in 'value: int = 1' 'extern foreign(): int' 'exception Empty' 'need "libnothing.so"' 'import "unused.l8"' 'type Choice = | A | B'; do
  >     printf 'tag example;\nmain(): int { 0; }\n%s\n' "$declaration" > eof.l8
  >     l8 fmt eof.l8 | tail -n 1
  > done
  value: int = 1
  extern foreign(): int
  exception Empty
  need "libnothing.so"
  import "unused.l8"
      | B

Between other statements, the semicolon is required:

  $ printf 'tag example;\nmain(): int { value: int = 1 value }\n' > required.l8
  $ l8 compile required.l8
  error: required.l8:2:30: unexpected token
  [1]
