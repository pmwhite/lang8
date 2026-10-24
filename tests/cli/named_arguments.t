Named arguments preserve source evaluation order in both native backends.
The formatter preserves parameter modes, function types, and argument order.

  $ cat > named.l8 <<'L8'
  > tag named_example;
  > trace: int = 0;
  > step(n: int): int { trace = trace * 10 + n; n }
  > combine(named a: int, b: int, named c: int): int { a * 100 + b * 10 + c }
  > main(): int {
  >     result: int = combine(c: step(1), step(2), a: step(3));
  >     if (result != 321 || trace != 123) return 1;
  >     callback: fn(named a: int, value: int, named c: int): int = &combine;
  >     trace = 0;
  >     result = callback(c: step(1), step(2), a: step(3));
  >     if (result != 321 || trace != 123) return 2;
  >     0
  > }
  > L8
  $ l8 fmt named.l8 > formatted.l8
  $ l8 fmt formatted.l8 > twice.l8
  $ cmp formatted.l8 twice.l8
  $ grep 'named ' formatted.l8
  combine(named a: int, b: int, named c: int): int {
      callback: fn(named a: int, value: int, named c: int): int = &combine;
  $ grep 'c: step' formatted.l8
      result: int = combine(c: step(1), step(2), a: step(3));
      result = callback(c: step(1), step(2), a: step(3));
  $ l8 build formatted.l8 -o direct
  $ ./direct
  $ l8 compile formatted.l8 > named.s
  $ l8 as -o named.o named.s $TESTDIR/../../runtime.s
  $ l8 elfpack named.o -o assembled
  $ ./assembled
