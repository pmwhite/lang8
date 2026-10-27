# Archives

Import `archive.l8` and use the `archive` tag. It reads zip archives and tar
files held whole in memory, such as a SWORD module package
(`packages/rawzip/NAME.zip`) or a repository catalog (`mods.d.tar.gz`,
decompressed first with `deflate::gzip_decompress`). It imports
[`../deflate`](../deflate/README.md); native and Wasm builds are supported.

```l8
entries: []ZipEntry = zip_entries(package, package_size);
conf: int = zip_entry_index(entries, "mods.d/kjv.conf");
text: []i8 = zip_entry_bytes(package, package_size, &entries[conf]);

members: []TarEntry = tar_entries(catalog, catalog_size);
```

Each function reads the first `size` bytes of the given slice and returns
new data in the caller's allocation region. Entries borrow nothing from the
archive: their names are copied, and their data is read on request.

`zip_entries` lists the central directory in order. Each `ZipEntry` gives
its name as stored (folders end with `/`, tested by `zip_entry_is_folder`),
its `ZipMethod`, sizes, CRC-32 and whether it is encrypted.
`zip_entry_bytes` returns an entry's data, stored or deflated, checked
against its CRC-32. Zip64, multi-disk archives, encryption and other
compression methods are reported rather than misread; listing succeeds for
entries that cannot be read, so callers can explain which ones those are.

`tar_entries` lists ustar and GNU tar members, each with its name, a
`TarKind` (file, folder, or another kind with its type flag) and the
offset and size of its data within the tar. POSIX ustar prefixes are
joined to names; GNU long names (`L`) and pax `path` and `size` records
(`x`) apply to the member after them. Global pax headers (`g`) and GNU long
link names (`K`) are skipped. Header checksums are verified, and the
listing ends at a zero block or at the end of the data.

Failures raise `ArchiveError { failure, at }`: an `ArchiveFailure` variant
and the archive byte offset near which it was found; decoding failures
carry their `DeflateFailure`. `archive_failure_name` describes the variant.
`archive_test.l8` holds the contract's examples.
