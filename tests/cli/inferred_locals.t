Local inference is preserved by formatting and works in both native backends.

  $ cat > inferred.l8 <<'L8'
  > tag example;
  > twice(named value: int): int { value * 2 }
  > main(): int {
  >     count:=3;
  >     callback := &twice;
  >     result := callback(value: count);
  >     if (result != 6) return 1;
  >     count = 4;
  >     if (count != 4) return 2;
  >     0
  > }
  > L8
  $ l8 fmt inferred.l8 > formatted.l8
  $ l8 fmt formatted.l8 > twice.l8
  $ cmp formatted.l8 twice.l8
  $ grep ':=' formatted.l8
      count := 3;
      callback := &twice;
      result := callback(value: count);
  $ l8 build formatted.l8 -o direct
  $ ./direct
  $ l8 compile formatted.l8 > inferred.s
  $ l8 as -o inferred.o inferred.s $TESTDIR/../../runtime.s
  $ l8 elfpack inferred.o -o assembled
  $ ./assembled

Globals, parameters, and fields still require explicit types.

  $ printf 'tag example;\nvalue := 1;\n' > global.l8
  $ l8 compile global.l8
  error: global.l8:2:8: expected type
  [1]
  $ printf 'tag example;\nidentity(value := 1): int { value }\n' > parameter.l8
  $ l8 compile parameter.l8
  error: parameter.l8:2:17: expected type
  [1]
  $ printf 'tag example;\ntype Box = { value := 1 }\n' > field.l8
  $ l8 compile field.l8
  error: field.l8:2:21: expected type
  [1]
