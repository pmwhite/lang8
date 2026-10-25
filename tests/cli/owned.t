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
