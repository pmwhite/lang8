The static source gate accepts fixed arrays, payload exceptions and the output
library on every code generator. It checks all imported functions and global
initializers, not just a grep of the entry point. Runtime startup is tracked
separately while the legacy runtimes are being migrated.

  $ cat > ok.l8 <<EOF_L8
  > tag demo;
  > import "$TESTDIR/../../stdlib/print.l8";
  > use_tag std;
  > labels: []str = ["answer", "unused"];
  > exception Answer { value: int }
  > fail() raises Answer { raise Answer { value: 42 } }
  > main() raises IoError: int {
  >     values: [2]int = [1, 2];
  >     if (labels[0] != "answer") return 1;
  >     try { fail() } with Answer e -> { print_int(e.value) }
  >     values[0] - 1
  > }
  > EOF_L8
  $ l8 build --static ok.l8 -o ok && ./ok
  42
  $ l8 compile --static ok.l8 > ok.s
  $ l8 wasm --static ok.l8 -o ok.wasm
  $ l8 arm64 --static --target linux ok.l8 -o ok-arm64.s
  $ grep -c 'call l8_exc_malloc' ok.s
  0
  [1]

Explicit and implicit dynamic storage both fail, including global initializers.

  $ cat > bad.l8 <<'EOF_L8'
  > tag demo;
  > data: []int = new int[2](0);
  > main(): int { data[0] }
  > EOF_L8
  $ l8 build --static bad.l8 -o bad
  error: bad.l8:2:15: static storage: new expression allocates
  [1]
  $ cat > bad.l8 <<'EOF_L8'
  > tag demo;
  > main(): int { data: []int = [1, 2]; data[0] }
  > EOF_L8
  $ l8 wasm --static bad.l8 -o bad.wasm
  error: bad.l8:2:29: static storage: slice literal allocates; use a fixed array
  [1]
  $ cat > bad.l8 <<'EOF_L8'
  > tag demo;
  > main(): int { data: []i8 = bytes("abc"); len(data) }
  > EOF_L8
  $ l8 compile --static bad.l8 > bad.s
  error: bad.l8:2:28: static storage: string conversion allocates
  [1]

An unused allocating function in an imported file is still a migration blocker.

  $ cat > lib.l8 <<'EOF_L8'
  > tag demo;
  > unused(): int { data: []int = new int[1](0); data[0] }
  > EOF_L8
  $ cat > bad.l8 <<'EOF_L8'
  > tag demo;
  > import "lib.l8";
  > main(): int { 0 }
  > EOF_L8
  $ l8 build --static bad.l8 -o bad
  error: lib.l8:2:31: static storage: new expression allocates
  [1]

Unknown foreign functions must be audited, including allocator aliases.

  $ cat > foreign.l8 <<'EOF_L8'
  > tag demo;
  > extern hidden(n: int): *i8 = malloc;
  > main(): int { 0 }
  > EOF_L8
  $ l8 build --static foreign.l8 -o foreign
  error: foreign.l8:2:8: static storage: foreign function requires an allocation audit
  [1]

The sizeof operand is not evaluated and does not allocate.

  $ cat > size.l8 <<'EOF_L8'
  > tag demo;
  > main(): int { sizeof(new int[2](0)) - 8 }
  > EOF_L8
  $ l8 build --static size.l8 -o size && ./size

Zeroed buffers use a fixed array type and round-trip through the formatter.

  $ cat > zero.l8 <<'EOF_L8'
  > tag demo;
  > main(): int { data: [4096]i8 = zeroed([4096]i8); data[4095] as int }
  > EOF_L8
  $ l8 fmt -w zero.l8
  $ l8 build --static zero.l8 -o zero && ./zero
  $ l8 wasm --static zero.l8 -o zero.wasm
  $ l8 arm64 --static --target linux zero.l8 -o zero-arm64.s

Non-null values and overflowing capacities cannot be zero-initialized.

  $ cat > badzero.l8 <<'EOF_L8'
  > tag demo;
  > main(): int { data: [2]str = zeroed([2]str); len(data) }
  > EOF_L8
  $ l8 build --static badzero.l8 -o badzero
  error: badzero.l8:2:44: zeroed requires a fixed array of zero-initializable values
  [1]
  $ cat > overflow.l8 <<'EOF_L8'
  > tag demo;
  > main(): int { data: [2305843009213693953]int = zeroed([2305843009213693953]int); data[0] }
  > EOF_L8
  $ l8 build --static overflow.l8 -o overflow
  error: overflow.l8:2:80: zeroed requires a fixed array of zero-initializable values
  [1]

Legacy escape annotations no longer impose compiler lifetime checks.
This example is compiled only: its returned frame storage has expired.

  $ cat > escape.l8 <<'EOF_L8'
  > tag demo;
  > escape(): []i8 { buffer(4, 0i8) }
  > main(): int { len(escape()) }
  > EOF_L8
  $ l8 build escape.l8 -o escape

Static startup currently accepts a parameterless main; argument storage is
still a legacy runtime dependency.

  $ cat > args.l8 <<'EOF_L8'
  > tag demo;
  > main(argc: int, argv: []str): int { argc - len(argv) }
  > EOF_L8
  $ l8 build --static args.l8 -o args
  error: args.l8:2:1: static storage: main arguments require bounded startup storage
  [1]
