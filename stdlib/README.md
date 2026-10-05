# Standard library

Import `stdlib/print.l8` and add `use_tag std;`. `print(text)` writes a line
to standard output; `eprint(text)` writes a line to standard error.
`print_int(n)`, `print_fixed(x, places)` (an `f64` rounded to at most nine
decimal places), and `print_bool(value)` each write a value as one line. Import
`stdlib/write.l8` for exact output: `write(fd, text)` writes a `str`,
`write_bytes(fd, bytes)` writes a byte slice, and `write_byte(fd, byte)` takes
an `i8` value. These functions retry interrupted and partial writes until
all bytes are written, or raise `IoError { code }` with a positive Linux errno.
An error can follow a partial write; output cannot be rolled back.

`write_int(fd, n)` and `write_fixed(fd, x, places)` write numbers without a
newline. `write_bytes_n(fd, bytes, count)` writes a prefix. `write_some(fd, bytes,
offset, count)` makes one system call and returns its byte count so a caller
can resume after a short write. `write_some_text(fd, text)` does the same for
text. Byte ranges must be proved valid at compile time: `0 <= offset`,
`offset <= len(bytes)`, `0 <= count`, and `count <= len(bytes) - offset`.
Declare `IoError` with `raises` or catch it at the call site.

For example, from a file in `programs/examples`:

```l8
import "../../stdlib/print.l8";

use_tag std;

main() raises IoError: int {
    print("hello");
    0
}
```

The compiler uses `raw_write.l8` for its low-level diagnostic output. Both
modules are ordinary L8 source; `raw_write.l8` declares a native assembly
dependency. Import and native paths are relative to the file that declares
them. Run the library tests with `make stdlib-test`; they are `l8 test` files in
`stdlib/tests/`.
