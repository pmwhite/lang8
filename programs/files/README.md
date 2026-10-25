# File replacement

Import `files.l8` and use the `files` tag. `replace_file_bytes(path, data, count)`
replaces a saved value with the first `count` bytes of `data`. It creates a
private (0600) temporary sibling, completes the write, checks close, then renames
it over the destination. A reported failure preserves the previous destination.
The parent directory must already exist. Concurrent successful replacements
follow rename order: the last one wins.

`FileError` identifies the failed `FileOperation`, a positive errno, and a
separate `cleanup_code` if temporary-file cleanup also failed. Invalid byte
counts fail before opening a file. `file_operation_name` describes the operation.

The implementation targets native Linux with libc and the L8 runtime's close
operation. It does not call fsync: success gives atomic visibility to readers,
not a guarantee that the latest save survives power loss. Replacement installs
a new file and its private permissions, rather than retaining the old inode's
permissions or hard links. Allocations belong to the caller's region.
