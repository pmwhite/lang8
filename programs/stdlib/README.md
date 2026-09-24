# Standard library

Import `programs/stdlib/print.l8` and call `std::print(text)` for a line on
standard output or `std::eprint(text)` for a line on standard error. Both take
one `str` and append a newline. Import `write.l8` for exact output:
`std::write(fd, text)` writes a `str`, and `std::write_bytes(fd, bytes)` writes
a byte slice. Use `std::write_bytes_n` to write part of a slice. The `_result`
variants return the operating system's byte count.

For example, from a file in `programs/examples`:

```l8
import "../stdlib/print.l8";

main(): int {
    std::print("hello");
    0
}
```

The library is ordinary L8 source with a native assembly dependency declared
in `write.l8`. Import paths and native source paths are relative to the file
that declares them. `build` assembles native sources with the program. Run the
library tests with `./build.sh stdlib-test`.
