An indirect drop cannot invalidate a live borrow. Native code reports the
reason; WebAssembly exits through its runtime trap boundary.

  $ R=$TESTDIR/../..
  $ l8 build $R/tests/compiler/owned_pinned.l8 -o pinned
  $ ./pinned
  arena is borrowed
  [1]
  $ l8 wasm $R/tests/compiler/owned_pinned.l8 -o pinned.wasm
  $ node $R/web/run.mjs pinned.wasm
  [1]

A call on the right side can refill an emptied global. Assignment checks the
destination after that call and rejects losing the new owner.

  $ cat > refill.l8 <<'EOF'
  > tag demo;
  > type Box = { value: int }
  > slot: ?owned *Box = null;
  > refill(): owned *Box {
  >     drop slot;
  >     slot = own { new Box { value: 1 } };
  >     own { new Box { value: 2 } }
  > }
  > main(): int {
  >     drop slot;
  >     slot = refill();
  >     0
  > }
  > EOF
  $ l8 build refill.l8 -o refill
  $ ./refill
  [1]
  $ l8 wasm refill.l8 -o refill.wasm
  $ node $R/web/run.mjs refill.wasm
  [1]

An element of a []?owned *T is checked when it is used. Borrowing an empty
element and assigning into a full one both stop the program.

  $ cat > elements.l8 <<'EOF'
  > tag demo;
  > type Box = { value: int }
  > main(argc: int, _argv: []str): int {
  >     boxes: []?owned *Box = new ?owned *Box[1](null);
  >     if (argc > 1) {
  >         borrow boxes[0] as box {
  >             box.value = 1
  >         }
  >     }
  >     boxes[0] = own { new Box { value: 2 } };
  >     boxes[0] = own { new Box { value: 3 } };
  >     0
  > }
  > EOF
  $ l8 build elements.l8 -o elements
  $ ./elements empty
  arena is empty
  [1]
  $ ./elements
  [1]
  $ l8 wasm elements.l8 -o elements.wasm
  $ node $R/web/run.mjs elements.wasm empty
  [1]
  $ node $R/web/run.mjs elements.wasm
  [1]
