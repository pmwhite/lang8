# iOS bindings

`objc.l8` provides the Objective-C message aliases and UIKit helper operations
used by the native applications and hot-reload host. Build the check program
with `make .build/ios-check.s`; native UIKit execution needs an Apple device or
simulator environment.

For UTF-8 text, create caller-owned `NSBytes` with `ns_bytes_storage()` and pass
its address to `nsstring_bytes(ns, &storage)` or `nsstring_text(ns, &storage)`.
They copy up to 65,536 bytes and supply a counted view and trailing NUL.
A returned view lasts until the storage expires or is filled again. Oversized
text terminates explicitly. There is no shared scratch and no L8 heap copy.
Objective-C objects and Foundation's UTF-8 conversion remain native allocations.
