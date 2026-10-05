The analysis commands report on a whole import graph without changing the
ordinary build. They only read their input, so run them from the repository
root:

  $ cd $TESTDIR/../..

`forlint` suggests `for` loops for while loops with a simple counter:

  $ l8 forlint tests/compiler/forlint.l8
  warning: tests/compiler/forlint.l8:9:5: while loop can use for i in 0..end
  warning: tests/compiler/forlint.l8:19:5: while loop can use for item in xs

Ordinary compiles warn about unnecessary returns and ignored return values, with
their locations:

  $ l8 compile tests/compiler/retwarn.l8 > /dev/null
  warning: tests/compiler/retwarn.l8:11:5: unnecessary return in id
  warning: tests/compiler/retwarn.l8:19:5: ignored return value in drop
  warning: tests/compiler/retwarn.l8:41:16: unnecessary return in both
  warning: tests/compiler/retwarn.l8:41:34: unnecessary return in both

`boolint` finds int variables, fields, parameters and returns that only carry
booleans:

  $ l8 boolint tests/compiler/boolint.l8
  warning: tests/compiler/boolint.l8:6:5: int field enabled is used only as a boolean; use bool
  warning: tests/compiler/boolint.l8:18:5: int local active is used only as a boolean; use bool
  warning: tests/compiler/boolint.l8:10:1: int return value of choose is used only as a boolean; use bool
  warning: tests/compiler/boolint.l8:11:5: int local result is used only as a boolean; use bool
  warning: tests/compiler/boolint.l8:10:8: int local on is used only as a boolean; use bool
  $ l8 boolint tests/compiler/unusedfields.l8
  warning: tests/compiler/unusedfields.l8:15:5: int field enabled is used only as a boolean; use bool

`unreachable` finds dead branches, loop bodies and statements:

  $ l8 unreachable tests/compiler/unreachable.l8
  warning: tests/compiler/unreachable.l8:5:16: unreachable if branch
  warning: tests/compiler/unreachable.l8:6:30: unreachable else branch
  warning: tests/compiler/unreachable.l8:7:19: unreachable while body
  warning: tests/compiler/unreachable.l8:8:23: unreachable for body
  warning: tests/compiler/unreachable.l8:11:9: unreachable statement
  warning: tests/compiler/unreachable.l8:14:5: unreachable statement

`unusedfields` finds record fields that are never read:

  $ l8 unusedfields tests/compiler/unusedfields.l8
  warning: tests/compiler/unusedfields.l8:5:5: record field Inner.spare_inner is never read
  warning: tests/compiler/unusedfields.l8:18:5: record field Flags.write_only is never read
  warning: tests/compiler/unusedfields.l8:17:5: record field Flags.spare is never read

`unusedassign` finds overwritten values and declarations that can move to
their first assignment:

  $ l8 unusedassign tests/compiler/unusedassign.l8
  warning: tests/compiler/unusedassign.l8:10:5: value assigned to first is overwritten before being read
  warning: tests/compiler/unusedassign.l8:13:5: value assigned to second is overwritten before being read
  warning: tests/compiler/unusedassign.l8:14:5: value assigned to second is overwritten before being read
  warning: tests/compiler/unusedassign.l8:28:9: value assigned to nested is overwritten before being read
  warning: tests/compiler/unusedassign.l8:32:5: declaration of delayed can be combined with its first assignment
  warning: tests/compiler/unusedassign.l8:36:5: declaration of branched can be combined with its first assignment
  warning: tests/compiler/unusedassign.l8:40:5: declaration of matched can be combined with its first assignment
