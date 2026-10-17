# Smooth Bible

The Berean Standard Bible to read on an iPhone, in UIKit's own views: an
L8 program (`ios.l8`) compiled by `l8 arm64 --target ios`, with no Swift,
Objective-C source or Xcode project. It sends messages to UIKit through the
Objective-C runtime (`programs/ios/objc.l8`), and makes its own classes and
delegates there at run time, so the text scrolls, selects, copies and is
read aloud by VoiceOver as it would be in the phone's own apps.

## Reading

- The chapter is set in the phone's serif (New York), sized from its text
  size (Settings, Display & Brightness, Text Size), on warm paper (near black
  in dark mode). Its book and number head it; its headings, the passages they
  point to, psalms' titles, poetry's indents and stanzas, and lists are as
  the BSB sets them. Verses are numbered small, in the margin's color.
- A finger slides from one chapter to the next, or back; the next
  chapter's name at the end goes on to it too.
- The chapter's name at the top opens the books (the Old and New
  Testaments, at the book being read); a book opens its chapters, as a grid.
- A footnote's mark (a small letter) shows its note.
- Reading on hides the bars and the status bar; a tap brings them back (or
  hides them), as does going back to the top.
- Where you were (the chapter, and how far down) is kept for next time,
  and through a change of the text size.
- A link opens a chapter: `bsb://JHN/3` (the book's three-letter code, as
  the text has them, and the chapter).

## Files

- `data/bsb.txt` is the text, one record a line (see `text.l8` and
  `tools/bsb.py`, which made it from ebible.org's USFM, `engbsb_usfm.zip`).
  The BSB is in the public domain.
- `text.l8` indexes it and lays a chapter out as runs of styled text;
  `test_text.l8` tests that (`make bible-test`).
- `ios.l8` is the app: its classes, its views, and their look.
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
