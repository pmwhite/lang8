# Folio

Import `folio.l8` and use the `folio` tag. A folio is a document stored for
reading software: a Bible, a commentary, a book or a dictionary, as text
records (below) compressed in blocks, with an index of its divisions (its
books and chapters, or its entries) so a reader can decode just the part
it shows. It imports `deflate` and `builder`; native and Wasm builds are
supported.

```l8
writer: *FolioWriter = folio_writer_new();
folio_meta(writer, "title", "Berean Standard Bible");
folio_append_records(writer, records, 0, len(records));
file: []i8 = folio_finish(writer);

folio: *Folio = folio_open(file, len(file));
chapter: int = folio_find(folio, "PSA.23");
text: []i8 = folio_read(folio, file, folio_division_start(folio, chapter),
    folio_division_end(folio, chapter));
```

## The file

Every number is an unsigned 32-bit little-endian integer.

| Offset | What |
|---|---|
| 0 | `FOLIO`, a zero byte, the format's version (3) and a zero byte |
| 8 | the head's size: the bytes before the first block |
| 12 | how many blocks there are |
| 16 | the content's size, decoded |
| 20 | the content's bytes in each block, decoded (the last block may hold fewer) |
| 24, 28 | the metadata's size compressed, then decoded |
| 32, 36 | the index's size compressed, then decoded |
| 40, 44 | the word index's size compressed, then decoded |
| 48 | each block's size compressed, a number each |

Then the metadata and the index, each a raw DEFLATE stream, then the
blocks, each a raw DEFLATE stream of its part of the content, then the
word index (below), one raw DEFLATE stream. A block's
place in the content follows from its number; its place in the file from
the sizes before it. So a reader needs the head (`folio_head_size` says
how big it is, from the file's first 12 bytes) and then only the blocks
holding what it shows: a block is decoded alone, and a part of the content
may run across blocks.

The metadata is lines of `key`, a tab, and a value; the index is lines of
a division's key, a tab, where it begins in the content and a tab and where
it ends (the content's offsets, in decimal), and perhaps a tab and its
title (what a reader shows of it in a list: a book's part's name), and
after it a tab and its marks (below; the title may then be empty).
Divisions follow one another:
each runs to the next one's start, the last to the content's end, and the
content before the first is the document's own (a heading, an
introduction). Keys are unique, and hold no tabs or line ends; neither do
values or titles.

A commentary's divisions (those with a `K` record) say their marks: the
places a reader may begin showing it at, so that it can show a part of a
long division without decoding all of it. A mark is `VERSE@OFFSET`, marks
separated by spaces, in order; OFFSET is from the division's start. A mark
with a verse is where that verse begins: a comment's first verse (its `K`;
verse 0, an introduction, is a mark without a verse) or a verse a `V` in it
begins. One of verse 0 is where a paragraph (`P`), a heading (`S`, `s`) or
a comment begins `FOLIO_MARK_SPAN` (1536) bytes or more after the mark
before, so that marks are no further apart than that, but where one
paragraph is longer. `folio_division_marks` reads them; a folio of the
format's first version, which the library still reads, has none
(`folio_marked` says). A folio of the second version has no word index
and no offsets 40 and 44: its block sizes begin at 40.

## The word index

Every word of the content, folded, with the units it is in, so that a
reader finds where a search's words are without decoding the content. A
word is a run of ASCII letters and digits and bytes past ASCII, but for
the punctuation U+2000 to U+206F and the no-break space; ASCII capitals
are folded to small letters (`folio_fold_words` folds a query the same
way). A word longer than 48 bytes is left out.

A unit is where a result begins, at the content offset of the record that
begins it. In a Bible (metadata `kind` `bible`) a unit begins at each
book, chapter, verse, comment and heading (`B`, `C`, `V`, `K`, `S`, `s`,
`D`, `M`); in any other document at a paragraph (`P`) too. The words
counted are those of the records a reader reads: the text, a link's
words, headings, a psalm's title, an outline's lines (`T W I J G U H X L
S s D d M m A O`); and in documents other than Bibles, notes (`F`), which
in a Bible are a translator's rather than its text.

The stream holds unsigned LEB128 numbers (varints) and bytes:

1. flags (1: units begin at paragraphs);
2. the number of units, then each unit's place as the difference from the
   one before;
3. the number of words, then for each word in byte order: how many
   leading bytes it shares with the word before, how many follow, those
   bytes, how many units it is in, and how many bytes its units take;
4. each word's units, in the words' order: unit numbers as the
   difference from the one before.

`folio_has_words` says whether a folio has an index, and
`folio_words_place`, `folio_words_packed` and `folio_words_size` give its
place and sizes. `folio_words_open(source, at, packed, size)` reads it.
`folio_words_units(words, w, from, to, matching)` gives the places of the
units that hold the word `w[from..to)`: `Whole`, or with `Beginning` the
units of the 256 most common words it begins (`FOLIO_BEGINNING_WORDS_MOST`).
`folio_units_both` intersects two lists, and `folio_unit_end` says where
a unit ends.

## Metadata

Keys a reader understands:

- `kind`: `bible`, `commentary`, `book` or `dictionary`.
- `name`: a short name that identifies the document (`BSB`, `TDavid`).
- `title`: what it is called.
- `language`: a BCP 47 tag (`en`, `grc`).
- `versification`: the verse numbering a Bible or commentary follows
  (`KJV`, as SWORD names them).
- `license`, `source`, `about`: its terms, where it came from, and what a
  reader may want to know about it (paragraphs separated by ` ¶ `).

## Records

The content is records, one a line: a letter saying what, then its text.
Words carry no markup: a record is one run of words in one style.

Scripture (a Bible's text, and the passages a commentary is keyed by):

    B<CODE> <name>   a book (GEN Genesis), by its USFM code
    C<n>             a chapter
    M<text>          a major section (BOOK I), m its range (Psalms 1-41)
    S<text>          a section heading, s a lesser one
    R<text>          the passages a heading points to
    D<text>          a psalm's title (d: more of it, after a footnote in it)
    A<text>          an acrostic letter (Aleph)
    P<k>             a paragraph: m plain, o opening, 1 2 poetry,
                     l L a list, c centered, r to the right
    _                a break between stanzas
    V<n>             a verse begins (V15>14: verse 15, keyed as 14)
    N<c>:<v>         the verse's number in another numbering (a Hebrew
                     verse's, where it differs)
    F<text>          a footnote, where it is marked

Words:

    T<text>          words
    W<text>          words of Jesus
    I<text>          words in italic (in a Bible, those supplied)
    J<text>          words of Jesus in italic
    G<text>          words in bold
    U<text>          words in small capitals (the divine name)
    H<text>          Hebrew, X<text> Aramaic (right to left)
    L<target>\t<text>  words that point to a passage: target osis:<ref>
                     (osis:Gen.1.1, osis:Gen.1.1-Gen.2.3), ref:<ref> by
                     USFM book code (ref:JHN.3.16, ref:JHN.3.1-3.8) or
                     passage:<as written> (passage:John 3:16; Rom 5:8)

Commentary:

    K<c>:<v>-<c2>:<v2>  a comment on those verses begins (verse 0: the
                        chapter's introduction); a V record in it begins
                        its part on that verse, where its author marked
                        one ("Verse 3."), an earlier one too where its
                        author goes through the verses again
    O<text>\t<v>[-<v2>] a line of a chapter's outline, and its verses
    E<label>            a note's mark (b, 12), raised, where the comment's
                        words mark a note it holds itself; the note's
                        paragraph begins with the same mark

In a Bible, words have no space at their end, and at their start only
where they follow other words or a footnote's mark in the same line of
text. A commentary's words keep their spaces as written. A record's text
holds no line end or tab (save an L record's one tab).

A dictionary's divisions are its entries, keyed as it keeps its keys; a
book's are its parts, keyed by their place in its outline (`1`, `1.2`,
`1.2.3`) and titled by their names (programs/sword_folio says what each
makes).

`folio_append_records` begins a division at each book (keyed by its code,
`PSA`) and each chapter (`PSA.23`), so a Bible's and a commentary's
chapters are found by their keys. Records are passed whole: a call holds
complete lines.

## Writing

`folio_writer_new` begins a folio. `folio_meta(writer, key, value)` (or
`folio_meta_bytes`) sets a metadata value; `folio_division(writer, key,
from, to)` begins a division at the content's end, keyed by those bytes
(`folio_division_titled` gives it a title too);
`folio_append(writer, data, from, to)` adds content, and
`folio_append_records` adds records, beginning a division at each book and
chapter. A key or value with a tab or a line end, or a key used twice, is
`BadKey`. Each block is compressed as soon as it is full, so writing a
document piece by piece spreads the work out. `folio_finish` returns the
file. Add to a writer where it was allocated, as a builder grows.

## Reading

`folio_head_size(file, count)` is the head's size, from at least the file's
first 12 bytes. `folio_open(head, count)` reads a head (at least that many
bytes) into a `Folio`. `folio_meta_value(folio, key)` is a metadata value
(empty if it has none); `folio_find(folio, key)` a division's number (-1:
none), and `folio_division_count`, `folio_division_key`,
`folio_division_title`, `folio_division_start` and `folio_division_end`
describe each.

A reader holding the whole file decodes with `folio_read(folio, file, from,
to)` (a part of the content), `folio_read_into(folio, file, from, to, out,
out_at)` (the same, into a slice of the caller's) or `folio_content(folio,
file)` (all of it).
A reader that fetches blocks as it needs them asks `folio_block_first(folio,
offset)` and `folio_block_last(folio, end)` which blocks a part needs,
`folio_block_offset` and `folio_block_compressed` where each is in the file,
and decodes each with `folio_decode_block(folio, block, source, start)`.

## Failures

Failures raise `FolioError { failure, block }`: `NotFolio`,
`UnsupportedVersion`, `Truncated` (fewer bytes than the head says it needs,
or than a block needs), `BadHead` (sizes that disagree, or a damaged index or
metadata), `Damaged` (a block that does not decode: its number is `block`),
or `BadKey`. `folio_failure_name` describes each. Nothing is returned on
failure.

## Tests

`folio_test.l8` holds the contract's examples: `l8 test
programs/folio/folio_test.l8`. `tools/folio_tool.l8` packs records into a
folio and shows what one holds.
