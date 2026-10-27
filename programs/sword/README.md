# SWORD modules

Import `sword.l8` and use the `sword` tag. It reads CrossWire's SWORD
modules (https://crosswire.org/sword/): Bibles, commentaries, lexicons and
dictionaries, glossaries, devotionals and general books, from a module
package as a repository serves it (`packages/rawzip/NAME.zip`, the module's
`.conf` and data files). It imports `deflate`, `archive` and `builder`.
Native and Wasm builds are supported.

```l8
package: *ModulePackage = package_open(zip, zip_size);
info: *ModuleInfo = &package.info;
match module_support(info) {
    Readable -> { }
    Unreadable u -> ...
}
bible: *VerseModule = verse_module_open(package);
system: *Versification = verse_module_system(bible);
markup: []i8 = verse_module_text_at(bible, verse_slot(system, book, 3, 16));
rich: *RichText = rich_new();
state: MarkupState = markup_state_new();
markup_convert(rich, &state, info.markup, markup, 0, len(markup));
```

## Modules

`conf_parse` reads a `.conf` (a repository's `mods.d.tar.gz` holds one per
module). `module_info` gathers what a reader shows: name, description,
`ModuleKind`, language, versification, `Markup`, size, version, licence,
copyright, about text (`about_paragraphs` turns its RTF escapes into
paragraphs), and whether it is locked or its teaching is outside
mainstream Christianity (`questionable`). `module_support` says whether
this library can read it, or why not (`UnsupportedReason`: locked with a
cipher key, a collection of images, an unknown storage driver or
compression, an unknown versification).

`package_open` reads the zip and its conf (its `info` is `module_info`'s);
`package_file` finds a data file
by the end of its name. The readers take the package and keep pointing
into it, so it must outlive them:

- `VerseModule` (zText, zText4, zCom, zCom4, RawText, RawText4, RawCom,
  RawCom4): an entry per verse slot. `verse_module_entry` gives a slot's
  entry, `verse_module_block` decodes one compressed block (so many verses
  are read with a block each), `verse_module_text` takes an entry's markup
  from it, and `verse_module_text_at` reads one verse alone.
  `verse_entries_same` tells verses that share a commentary's note.
  `verse_module_has_text` says whether a chapter (or, at 0, a book) has
  any text, since a module's testament files may be present and empty.
- `KeyModule` (RawLD, RawLD4, zLD): entries in key order.
  `key_module_find` looks up a key as the module keeps keys (capitals, and
  Strong's numbers padded to five digits or four after G or H unless the
  conf says otherwise). `key_module_seek` gives the first key not before
  it. `@LINK` entries are followed.
- `TreeModule` (RawGenBook): a tree of named nodes, each perhaps with text;
  `tree_module_first_child`, `tree_module_next` and `tree_module_parent`
  walk it from the root, node 0.

Compressed blocks may be zlib (padded streams are allowed) or LZSS.

## Verse numbering

`versification_named` returns one of the 18 systems SWORD registers (KJV,
KJVA, NRSV, Leningrad, MT, Synodal, Vulg, Catholic, LXX, ...), their books
in order with each chapter's verse count. `verse_slot` numbers a book,
chapter and verse as SWORD's files do: slot 0 the module's heading, then
each testament's heading, each book's and each chapter's (verse 0) before
its verses. `versification_book` finds a book by OSIS name.

`versification_data.l8` is generated from a SWORD source tree's
`include/canon*.h` by `tools/versifications.l8` (then formatted with
`l8 fmt -w`); do not edit it.

## Markup

`markup_convert` turns an entry's OSIS, ThML, GBF, TEI or plain text into a
`RichText`: words in styles (italic, bold, words of Jesus, added words, the
divine name, small capitals, superscript), paragraph and line breaks,
headings with their role (a section's, a psalm's title, an acrostic
letter), footnotes and cross-reference notes, and links (a scripture
reference, a Strong's number, another entry). What a reader would not see
is left out: Strong's and morphology attributes, variant tags, book and
chapter markers. A `MarkupState` carries what is open from one entry to the
next (the words of Jesus or a paragraph may span verses); give each run of
entries its own.

## Failures

Failures raise `SwordError { failure }`: `BadConf { line }`, `MissingFile
{ ending }`, `BadIndex`, `BadBlock`, `UnknownVersification`,
`NotSupported`, `BadPackage` or `BadKey`; `sword_failure_name` describes
each. A failure while decoding (a damaged block) raises the same way, so a
reader can show the rest of a module.

## Tools and tests

`tools/sword_dump.l8` prints what a package holds and a verse's markup, for
checking against real modules. `sword_test.l8` holds the contract's
examples: `l8 test programs/sword/sword_test.l8`.
