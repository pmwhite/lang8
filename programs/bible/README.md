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
  The bar names the chapter read; as the next one's row comes up to the
  bar, its name pushes the last one's out, in step with the scroll. A tap
  on the status bar goes to the top of the chapter (or the one before).
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
- Study (Round 2, in progress): the tray's fifth action opens the verse's
  interlinear (English or original order, a verse before or after); a
  word's tile opens its study (form, lemma, meaning, Strong's number,
  parsing in plain English, a definition from STEP Bible, how often and how
  it is translated), its definition, and its concordance (a verse there
  goes to it). Reading settings → Acknowledgements credits the sources.
- Versions (Round 4): the KJV, WEB, ASV and YLT are bundled beside the BSB,
  chosen in Reading settings → Version; the reader switches in place, at the
  same verse. Marks are by reference, so each shows in every version that
  has its verse. The ESV is read online through our own proxy (`worker/`),
  never more of it kept than Crossway's terms allow, and is offered only
  once that proxy says it can give it. The tray's Compare shows the verses
  in every version; Study gains References (OpenBible.info) and Commentary
  (Matthew Henry's Concise).
- Daily reading (Round 5): reading plans (a year, the NT in 90 days,
  Psalms and Proverbs in a month, the Gospels in 30 days, computed by
  `plans.l8`) in Go To's Reading Plan section and Reading Plans (A Chapter
  a Day among them), today's readings counting as read by rest, Listen or
  a tap; a plan's optional daily reminder of the day's
  reading (its authorization through the one block, `../ios/block.l8`).
  Word study shows a word's exact sense (STEP's TAHOT and TAGNT) and
  related words (MACULA), and the share sheet has Share as Image
  (`ios_share.l8`).
- Ribbons (Round 6, as revised): named places you carry while you read
  (`ribbons.l8`), made only by you (the title's long-press, New Ribbon
  Here…, or Go To's New Ribbon…), listed first in Go To in the order made
  (up to 12; ⓘ to rename or delete, a swipe to delete). Opening one picks it
  up: it then takes every rest's place, either way, and a read chapter's
  end is the next one's top (Listen too); any jump puts it down where you
  were, and the capsule back picks it up again; Leave Here puts it down by
  hand. Up to three of 1.0 (15)'s recent readings became ribbons once.
- Recorded readings (Round 7): Listen plays people reading, streamed from
  where they are published: the BSB by Bob Souer (or Barry Hays, Jordan
  Gilbert; CC0, openbible.com), the WEB by Winfred Henson (public domain,
  eBible.org), the ESV by David Cochran Heath (its address from our
  Worker); the KJV, ASV and YLT by the best installed iPhone voice. The
  verse being read is washed and followed from timings computed offline
  (`tools/align.py`, bundled as `data/audio/*.tim`); the ESV is followed
  by chapter. The next chapters are fetched ahead, books can be downloaded
  (Reading settings → Voice → Downloaded Books), and a recording that
  can't be reached is stood in for by the voice. Lock screen controls go
  by chapter.
- A link opens a chapter: `bsb://JHN/3` (or a verse, `bsb://JHN/3/16`).

## Files

- `data/bsb.txt` is the text, one record a line (see `text.l8` and
  `tools/usfm.py`, which made it from the publisher's USFM, `bsb_usfm.zip`);
  `data/kjv.txt`, `web.txt`, `asv.txt` and `ylt.txt` are the other versions,
  made by the same tool from eBible.org's USFM, and `data/refs.txt` the
  chapters where one has verses past the BSB's (`tools/versify.py`, which
  prints how each version's verses differ from the BSB's).
  `data/lang/` is the original-language data (`tools/bsb_lang.py`, from the
  Berean translation tables and STEP Bible's lexicons); `data/xrefs.bin` and
  `xref_index.bin` OpenBible.info's cross references (`tools/xrefs.py`);
  `data/mhcc.txt` Matthew Henry's Concise Commentary (`tools/mhcc.py`, from
  CCEL's ThML); `data/lang/senses.bin` each word's sense (`tools/senses.py`,
  from STEP's TAHOT and TAGNT) and `related.bin` related words
  (`tools/related.py`, MACULA's Proximity, CC BY 4.0).
  `tools/fetch.sh DIR make` downloads the sources, checks
  their sha256, and makes them all again.
  `lang.l8` reads the study data for the study screens (`test_lang.l8`), and
  `ios_study.l8` shows them.
  The BSB, KJV, WEB, ASV, YLT and the commentary are in the public domain;
  the cross references are CC BY 4.0.
- `text.l8` indexes it and lays a chapter out as runs of styled text;
  `test_text.l8` tests that (`make bible-test`).
- `ios.l8` is the app: the reader and its classes; `ios_look.l8` the themes,
  fonts and styles; `ios_store.l8` what is kept; `ios_select.l8` selection,
  the tray, the edit menu and jumps; `ios_sheets.l8` the sheets;
  `ios_versions.l8` the versions and switching; `ios_esv.l8` the ESV's
  client, cache on disk and the reader's states while a chapter comes
  (`esv_cache.l8` its portable rules, tested in `test_store.l8`);
  `ios_compare.l8` Compare; `ios_study2.l8` the Study sheet's segments;
  `ios_daily.l8` Go To's Ribbons and Reading Plan sections, the plans, a
  plan's days, A Chapter a Day and the reminder (`plans.l8` their portable
  part, tested in `test_plans.l8`); `ios_ribbons.l8` the ribbons' rows, New
  Ribbon, Ribbon, the title's menu, the glyph and the toasts (`ribbons.l8`
  their portable part, tested in `test_ribbons.l8`); `ios_share.l8` Share as
  Image; `ios_demo.l8` (and `ios_demo3.l8` to `ios_demo6.l8`)
  the demo CI runs.
- `audio.l8` is recorded readings' portable part (sources, addresses,
  timings, which source a chapter is heard from, the cache's rules), tested
  in `test_audio.l8`; `ios_audio.l8` the Voice screens, voices, the cache
  and downloads; `ios_listen.l8` both engines (AVQueuePlayer, no blocks;
  AVSpeechSynthesizer). `data/audio/<reader>.tim` are the verse timings
  and `henson.paths` eBible.org's file names
  (`tools/web_audio_manifest.py`); `tools/align.py` made the timings
  (wav2vec2 forced alignment of each recording to `tools/spoken.l8`'s text,
  `make bible-spoken VERSION=bsb`; see its docstring for running it), in a
  venv outside the repository; no audio is ever committed.
  `demo/audio/` is CI's audio fixture (`make_fixture.sh`: a tone, its
  timings, the ESV's answers), installed in every group (`L8_AUDIO_FIXTURE`).
- `worker/` is the ESV proxy, a Cloudflare Worker (`worker.js`; `esv.js`
  turns the ESV API's HTML into our records), with its tests
  (`node --test programs/bible/worker/test.mjs`, against `fixtures/`: the
  ESV's tags with the WEB's words) and `make_fixtures.mjs`, which writes the
  app's fixture (`ios/esv-fixture/`) for CI. It is deployed at
  smoothbible.com (below), with `/api/v1/esv/audio` (Round 7).
- `ios/` is what goes into the app besides its code: its Info.plist, icon
  (`AppIcon.svg`, drawn to `AppIcon.png` in Chromium, and as
  `AppIcon.svg#dark` and `#tinted` to `AppIcon-dark.png` and
  `AppIcon-tinted.png`, the tinted one on a transparent background),
  privacy manifest,
  named colors (`Colors/`: Paper, Ink, Faint, Accent, each light and dark),
  frameworks and resources; and `simulate.sh`, which runs it in the
  simulator.

```sh
tools/ios/build-linux.sh sim programs/bible/ios.l8 build programs/bible/ios     # anywhere
tools/ios/build-linux.sh device programs/bible/ios.l8 device programs/bible/ios # and the IPA
programs/bible/ios/simulate.sh build/SmoothBible.app shots                    # on a Mac
```

Both builds are linked with iOS 26.2's SDK, so on iOS 26 the app has iOS
26's design (the owner's choice); CI runs every group but `ios18` on the
iOS 26.2 simulator runtime (`ios/pick.sh`), and `ios18` shows the older
design. `build-linux.sh` needs no Mac: the compiler links the executable itself
(`l8 arm64 --exe`), and the asset catalog (the icon and the named colors) is
kept compiled in `ios/assets/`. When the icon or colors change, the Smooth
Bible assets workflow (`.github/workflows/bible-assets.yml`) compiles them
on a Mac and pushes them to `ci-bible-assets`; bring them in with `git
checkout origin/ci-bible-assets -- programs/bible/ios/assets` (the build
stops, saying so, until then). On a Mac, the Xcode way still works:

```sh
./l8c3 arm64 --target ios programs/bible/ios.l8 -o bible-ios.s
tools/ios/build.sh sim bible-ios.s build programs/bible/ios
```

GitHub builds it on every push to the `bible` branch
(`.github/workflows/bible.yml`): a Linux job tests the layout and compiles
the app, and macOS jobs build it for the simulator, run it there with
`L8_DEMO=1`, taking it through the books, a psalm, a footnote and John 3
(each step a Darwin notification, sent with `notifyutil`), and push the screenshots to the `ci-bible-shots` branch, and build
`SmoothBible.ipa` for an iPhone onto `ci-bible-ipa`. The `versions` group
runs with the ESV's fixture (`L8_ESV_FIXTURE`), so no key or network is
needed.

The CI's layout, for speed (a full run is about ten minutes; see the
workflow's header):

- `compile` (Linux) builds the compiler only when its sources change (a
  cache otherwise), then `SmoothBible.app` (`build-linux.sh`), uploaded for
  the simulator jobs, then the IPA (pushed to `ci-bible-ipa`); `test` runs
  the tests and the data checks beside it.
- Five `simulator (…)` jobs (macOS: the account runs at most five at once,
  so there are five, and nothing waits for a runner) start at once, boot a
  simulator (a first boot takes about three minutes) and take the app as
  soon as it is uploaded (`tools/ios/artifact.py`). (With the workflow's
  `MAC_BUILD` set, the first builds the app and the IPA instead, with
  Xcode's tools, from `compile`'s `bible-ios.s`.) Each runs two
  groups one after another on one simulator, reset between them by
  `simulate.sh` (app, defaults, permissions, keychain, pasteboard, status
  bar): any boot, a copy's or an erased simulator's too, costs minutes on
  these Macs, and slows whatever runs beside it. store and ios18 share the
  fifth Mac, each on its own simulator. Each group is uploaded
  (`shots-GROUP`) as it ends. (In the
  Mac build actool's output is cached, `ACTOOL_CACHE`, since it alone took
  most of the build.) The groups are paired by their times (`timing.txt`'s `total`) so
  the jobs end together: rebalance the workflow's matrix when a group
  grows.
- `frames` (Linux) makes the notes recording's frames as soon as the notes
  group is uploaded; `publish` puts it all on `ci-bible-shots`.
- A push during a run waits for it (and of several only the newest runs),
  so every run publishes.

## The ESV proxy: deploying it (each step needs the owner's consent)

All of this has been done (Round 7's `audio_url` table added with
`wrangler d1 execute … --file schema.sql`, 2026-10-18). The app works
without it: the ESV is simply not offered until
`https://smoothbible.com/api/v1/status` answers.

1. The ESV API key: register the application at
   `https://api.esv.org/account/create-application/` (DESIGN.md §9.10) and
   save the key to `~/.config/smooth-bible/esv-key` (never in chat or the
   repository).
2. Cloudflare: the `smoothbible.com` zone on the owner's account, and
   wrangler logged in (`npx wrangler login`).
3. In `programs/bible/worker/`:
   ```sh
   npx wrangler d1 create smooth-bible-api      # its id into wrangler.toml's database_id
   npx wrangler d1 execute smooth-bible-api --remote --file schema.sql
   npx wrangler secret put ESV_KEY < ~/.config/smooth-bible/esv-key
   npx wrangler deploy                          # the route smoothbible.com/api/*
   curl -s https://smoothbible.com/api/v1/status   # {"ok":true,"esv":true}
   ```
4. The two pages, `https://smoothbible.com/` and
   `https://smoothbible.com/privacy/` (what the proxy receives: a book, a
   chapter, a search, and the address for one minute of rate limiting;
   nothing kept).
5. Once deployed: `tools/esv_versify.py` (DESIGN.md §9.4.9) checks the ESV's
   verse numbering through the proxy, and the converter's class names are
   checked against real answers (real ESV HTML is never committed).
