Compiler token and AST storage has explicit bounds. Exhaustion fails before a
slot is written. These are compilation checks; no oversized program is run.

  $ python3 - <<'PY'
  > from pathlib import Path
  > Path('tokens.l8').write_text('tag demo;\n' + 'x ' * 1048576)
  > Path('statements.l8').write_text('tag demo; main(): int {\n' + '0;\n' * 131072 + '0 }\n')
  > PY
  $ l8 compile tokens.l8 > tokens.s
  error: compiler static pool exhausted: tokens (1048576)
  [1]
  $ l8 compile statements.l8 > statements.s
  error: compiler static pool exhausted: statements (131072)
  [1]

A later compilation still starts with fresh pools.

  $ printf 'tag demo; main(): int { 0 }\n' > small.l8
  $ l8 build small.l8 -o small
  $ ./small
