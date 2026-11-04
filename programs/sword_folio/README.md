# SWORD modules as folios

Import `sword_folio.l8` and use the `sword_folio` tag. It makes a
CrossWire SWORD module (programs/sword) into a folio (programs/folio) a
part at a time, so that a program making one answers its user between
parts: a commentary a chapter at a time, a dictionary's entries or a
book's parts some at a time. It imports `sword`, `folio` and `builder`;
native and Wasm builds are supported. The Bible app makes every module it
downloads but a Bible this way (a Bible becomes one of its versions), and
reads only the folio after.

```l8
making: *CommentaryImport = commentary_import_new(verse_module_open(package));
module_folio_meta(writer, &package.info);
more: bool = true;
while (more) {
    commentary_import_prepare(making);         // where making was allocated
    region {
        out: *ByteBuilder = builder_new(4096);
        more = commentary_import_next(making, out);
        allocate writer { folio_append_records(writer, out.data, 0, out.size) }
    }
}
```

## What it makes

The records are folio/README.md's.

- **A commentary**: its books by their USFM codes (`book_usfm_code`: the
  90 books of SWORD's versifications; `ADE` and `ENO`, which USFM lacks,
  are this library's), each chapter that has comments a `C`, each comment
  a `K` with its verses, then its paragraphs, headings, notes and links as
  records. A book's introduction (chapter 0) is its records before its
  first chapter. Numbering is the module's own.
- **Verses within a comment**: a comment on several verses is followed
  verse by verse where its author marks them. A paragraph that begins
  with a label (`verse_label_at`: "Verse 3.", "Ver. 3", "v. 3", in any
  case) or with a reference to a verse of the comment's own chapter and
  book (`reference_label_at`: "Gen 1:3", "{Mt 1:25 ...", "2:1-12", a link
  to Gen.1.3; a book named as commentators abbreviate it) begins that
  verse there, a `V`, as far as the next verse that has a comment of its
  own. A comment that labels its verses itself is followed by its labels
  alone (its references may be an outline's); a reference is taken only
  after a sentence has ended (else a line break cut a sentence), and only
  going forward. Labels may start again (notes after an exposition, each
  "Verse 3." in turn, begin their verses again), but a label of the verse
  just begun begins nothing (several notes on one verse). The `K` reaches
  as far as its labels do. Bare numbers ("3.")
  are not labels: they number sections and points as often as verses.
- **A dictionary**: an entry a division, keyed by the module's key (an
  introduction, the empty key, is the folio's own records); its metadata
  says how keys are kept (`keys`: `capitals` or `as-written`;
  `strongs-padding`: `yes`; `sword_key_normal` makes a word typed into a
  key) and what they are (`entries`: `dates`, `greek`, `hebrew` or
  `words`). An entry that is damaged, or links to none, is left out, and a
  key twice the second time.
- **A book**: a part a division, keyed by its place in the outline (`1`,
  `1.2`, `1.2.3`) and titled by its name; parts in reading order, the
  book's own text before them.

`module_folio_meta` writes what every folio of a module says: `kind`
(`commentary`, `dictionary`, `book`: how a reader reads it), `what` (SWORD's
kind: a glossary, a devotional), `name`, `title`, `language`,
`versification`, `license`, `copyright`, `version`, `source`, and
`importer`: which making of this library's it is (`SWORD_FOLIO_IMPORTER`,
counted up as what it makes of a module changes; `folio_importer` reads
it, 1 for a folio that doesn't say), so that a reader can make a folio
again from its module once this library makes it better;
`dictionary_folio_meta` adds a dictionary's keys'.

## Making

- `commentary_import_new`, then `commentary_import_prepare` (decodes a
  book's large block, kept for its chapters: call it where the making was
  allocated) and `commentary_import_next(making, out)` (a chapter's
  records into out; false once all are made: call it in a region).
- `dictionary_import_new` and `book_import_new`, then
  `dictionary_import_next(making, chunk)` and `book_import_next(making,
  chunk)` into an `ImportChunk` (`import_chunk_new`, in a region): records
  and where each entry or part begins. `import_chunk_append(writer, chunk)`
  adds it to the folio, its divisions begun (call it where the writer was
  allocated).
- `commentary_import_progress`, `dictionary_import_progress` and
  `book_import_progress` say how far it has come, in thousandths.

Failures in a commentary or a book raise `SwordError` (a damaged block);
a dictionary leaves its damaged entries out.

## Tests and tools

`sword_folio_test.l8` holds the contract's examples: `l8 test
programs/sword_folio/sword_folio_test.l8`. `tools/sword_folio_tool.l8`
makes a module's package into a folio and says what it made (`sword-folio
PACKAGE.zip OUT.folio`). Every commentary, dictionary and book in
CrossWire's catalog (2026-11) is made by it, those this library can't read
(locked, LZSS-compressed dictionaries) aside.
