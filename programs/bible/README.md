# Smooth Bible

The Berean Standard Bible to read on an iPhone, in UIKit's own views: an
L8 program (`ios.l8`) compiled by `l8 arm64 --target ios`, with no Swift,
Objective-C source or Xcode project. It sends messages to UIKit through the
Objective-C runtime (`programs/ios/objc.l8`), and makes its own classes and
delegates there at run time, so the text scrolls, selects, copies and is
read aloud by VoiceOver as it would be in the phone's own apps.

## Reading

`DESIGN.md` is the design it follows (Round 1 is built).

- Every chapter is a row of one table, read on by scrolling; a hairline
  divides chapters, each headed by its book's name (JOHN, PSALM) and number.
  The chapter's name shows in the bar only once its opener has gone under it.
- Themes (Auto, Paper, White, Sepia, Night, Black), five fonts, a text size
  on top of the phone's, line spacing, margins, and what to show (verse
  numbers, headings, footnote marks, a verse a line): the reading settings
  (Aa), applied live.
- A tap on a verse selects it: a tray offers five highlight colors, Copy,
  Share, Bookmark and Note. The text's own edit menu has Highlight, Note,
  Copy with Reference and Share first.
- The title opens the passage picker: a reference typed ("jn 3:16"), recent
  places, the books, and a book's chapters. Search finds verses with every
  word (or a quoted phrase), in a scope. The library lists highlights, notes
  and bookmarks by book. After any jump, a capsule goes back.
- Where you were (the chapter, verse, and how far into it) is kept through
  size changes and relaunches. Highlights, bookmarks, notes and history are
  files in Application Support/SmoothBible, by book, chapter and verse.
- A link opens a chapter: `bsb://JHN/3` (or a verse, `bsb://JHN/3/16`).

## Files

- `data/bsb.txt` is the text, one record a line (see `text.l8` and
  `tools/bsb.py`, which made it from ebible.org's USFM, `engbsb_usfm.zip`).
  The BSB is in the public domain.
- `text.l8` indexes it and lays a chapter out as runs of styled text;
  `test_text.l8` tests that (`make bible-test`).
- `ios.l8` is the app: the reader and its classes; `ios_look.l8` the themes,
  fonts and styles; `ios_store.l8` what is kept; `ios_select.l8` selection,
  the tray, the edit menu and jumps; `ios_sheets.l8` the sheets;
  `ios_demo.l8` the demo CI runs.
- `ios/` is what goes into the app besides its code: its Info.plist, icon
  (`AppIcon.svg`, drawn to `AppIcon.png` in Chromium), privacy manifest,
  named colors (`Colors/`: Paper, Ink, Faint, Accent, each light and dark),
  frameworks and resources; and `simulate.sh`, which runs it in the
  simulator.

```sh
./l8c3 arm64 --target ios programs/bible/ios.l8 -o bible-ios.s
tools/ios/build.sh sim bible-ios.s build programs/bible/ios   # on a Mac
programs/bible/ios/simulate.sh build/SmoothBible.app shots
```

GitHub builds it on every push to the `bible` branch
(`.github/workflows/bible.yml`): a Linux job tests the layout and compiles
the app, and macOS jobs build it for the simulator, run it there with
`L8_DEMO=1`, taking it through the books, a psalm, a footnote and John 3
(each step a Darwin notification, sent with `notifyutil`), and push the screenshots to the `ci-bible-shots` branch, and build
`SmoothBible.ipa` for an iPhone onto `ci-bible-ipa`.
