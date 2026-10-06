Every a[i] checks its index at run time. A failed check exits with status 1:

  $ cat > oob.l8 <<'EOF'
  > tag demo;
  > 
  > pick(a: []int, i: int): int {
  >     a[i]
  > }
  > 
  > main(): int {
  >     a: []int = [3, 4];
  >     pick(a, 1) + pick(a, 2)
  > }
  > EOF
  $ l8 build oob.l8 -o oob && ./oob; echo "exit $?"
  exit 1

`--unchecked-index` leaves the checks out. `compile`, `build`, `wasm`, and
`test` all accept it:

  $ l8 compile oob.l8 | grep -c jae
  1
  $ l8 compile --unchecked-index oob.l8 | grep -c jae
  0
  [1]
  $ cat > ok.l8 <<'EOF'
  > tag demo;
  > 
  > main(): int {
  >     a: []int = [3, 4];
  >     a[0] + a[1]
  > }
  > EOF
  $ l8 build --unchecked-index ok.l8 -o ok && ./ok; echo "exit $?"
  exit 7
