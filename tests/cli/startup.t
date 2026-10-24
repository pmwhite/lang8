Native Linux process arguments and environment snapshots use bounded permanent
storage. Repeated environment reads must not consume the legacy heap.

  $ cat > startup.l8 <<'EOF_L8'
  > tag demo;
  > extern heap_used(): int = l8_heap_used;
  > extern environment(): []str = l8_environment;
  > main(argc: int, argv: []str): int {
  >     if (len(argv) != argc || heap_used() != 0) return 1;
  >     if (argc == 4 && (argv[1] != "λ" || argv[2] != "two words" || argv[3] != "")) return 2;
  >     for _i in 0..3 {
  >         found: bool = false;
  >         empty: bool = false;
  >         for value in environment() {
  >             if (value == "L8_STATIC=λ=a") found = true;
  >             if (value == "EMPTY=") empty = true
  >         }
  >         if (!found || !empty || heap_used() != 0) return 3
  >     }
  >     0
  > }
  > EOF_L8
  $ l8 build startup.l8 -o startup
  $ python3 - <<'PY'
  > import subprocess
  > env = {'L8_STATIC': 'λ=a', 'EMPTY': ''}
  > def run(args, values=env):
  >     return subprocess.run(['./startup', *args], env=values, capture_output=True)
  > r = run(['λ', 'two words', ''])
  > assert (r.returncode, r.stdout, r.stderr) == (0, b'', b''), r
  > r = run(['x'] * 4095)
  > assert r.returncode == 0 and not r.stderr, r
  > r = run(['x'] * 4096)
  > assert (r.returncode, r.stderr) == (1, b'l8: process static storage exhausted\n'), r
  > values = {str(i): 'x' for i in range(4097)}
  > r = run([], values)
  > assert (r.returncode, r.stderr) == (1, b'l8: process static storage exhausted\n'), r
  > print('bounded arguments and environment: OK')
  > PY
  bounded arguments and environment: OK
