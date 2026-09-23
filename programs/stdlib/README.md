# Standard library

Import `programs/stdlib/print.l8` and call `std::print(text)` for a line on
standard output or `std::eprint(text)` for a line on standard error. Both take
one `str` and append a newline. Use `write` directly when you need exact bytes
or no trailing newline.

For example, from a file in `programs/examples`:

```l8
import "../stdlib/print.l8";

main(): int {
    std::print("hello");
    0
}
```

The library is ordinary L8 source; import paths are relative to the importing
file. Run its tests with `./build.sh stdlib-test`.
