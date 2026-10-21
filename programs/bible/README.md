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
- Daily reading (Round 5, and §16): reading plans in Go To's Reading Plan
  section and Reading Plans: Bible in a Year, Chronological (our own order,
  from Townsend's and Robertson's public-domain arrangements), M'Cheyne's
  Calendar (transcribed from Bonar's 1878 edition), Old and New Together,
  the NT in 90 days, Psalms and Proverbs in a month, the Gospels in 30
  days, and A Chapter a Day; a day is up to six passages (verse ranges).
  A plan's day opens in a reader of its own (`ios_day.l8`): the reader in
  a mode, its page only that day's passages, the title the passage you're
  in over the day, Done, Mark Read at the bottom right (a passage also
  marks itself, read to its end and rested in, or heard), the day's end
  with Mark Day as Read and Next, Listen through the day; a reference
  opened from it leaves it, and the capsule ("‹ Day 32") brings it back.
  A plan's optional daily reminder opens the day (its authorization
  through the one block, `../ios/block.l8`).
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
- Memory (Round 9): the tray's seventh action, Memorize, keeps the verses
  selected as a passage to learn, in the version read (Memorizing, once
  they are one, opens it); Add Passage takes a reference across chapters
  (`isa 52:13-53:12`, `ps 23`, up to 40 verses). The Library's Memory
  segment lists Today, New and Later. Practice shows a passage at Full,
  Some, Letters or Blank, the hidden letters kept in their places so the
  text never moves; a tap shows a word, Check shows them all, and Type
  takes each word's first letter. A long passage is learned a part a day,
  each joined to the one before; then Not Yet, Mostly or Knew It sets the
  next review (1 day to 6 months), with no streaks or scores. Listen and
  Echo play the passage from the recordings' verse timings (or the
  iPhone's voice), Echo pausing after each verse for you to say it. Memory
  can be a second reason for the plan's one daily reminder. ESV passages
  are kept within Crossway's terms (at most 200 verses of the 500).
- Greek and Hebrew (Round 10): a page per language, from Memory's
  Languages section or the interlinear's Learn Greek (Learn Hebrew) link,
  says in one sentence how much of its Testament the words you know make
  up. The Alphabet shows each letter's sound written against an English
  word ("b as in bat"), as Sounds Written As chooses (Erasmian, Koine or
  Modern Greek; Israeli or Tiberian Hebrew), and an example; nothing is
  spoken (§14.10b: the code waits behind `LEARN_SPEECH` for commissioned
  recordings). Letters are learned eight at a time, and Practise Reading
  gives common words of the letters known to read to yourself, Check
  showing the transliteration. Add Words offers the next ten most common
  words, words related to ones you know, or a passage's you read, carry
  a ribbon in or memorize; words are cards on Memory's schedule, each
  shown in a verse you care about and asking what it means there (the
  answer: the BSB's words for it in that verse, the sense, the verse, and
  related words you know), in Memory's Today and its reminder. In Greek or Hebrew Order the
  interlinear hides the English of the words you know (and the
  transliteration once you know the alphabet), nothing moving; a tap
  shows it. A word study gains Learn This Word and Forms (the lemma's
  forms as the Bible has them, each with the BSB's commonest rendering, a
  tap their concordance); Verses You Can Read lists the verses whose
  every word you know, first on the page once the alphabet is known.
- The Hebrew and Greek (Round 11, §14.11): one more version, the Hebrew
  Bible (the Leningrad Codex, the Qere read, right to left with its vowel
  points) and the Greek New Testament (NA28's words), keyed by the BSB's
  verses so marks, ribbons, plans and history work in it. Set like a
  reader's edition: a word you haven't learned (or, as chosen, a rare one)
  has a faint dotted line, and the paragraph's glosses follow it, the
  BSB's words for each; a gloss tapped opens the word's popover (its
  transliteration, gloss, meaning here and domain from UBS's dictionaries,
  parsing, a Qere's Ketiv, the Hebrew's own verse number, Word Study and
  Learn This Word). Reading settings has Glosses and Show Accents in it;
  Listen has no recording of the original yet. Search finds its words by
  Greek or Hebrew letters (accents and points not needed) or by Latin
  letters as they sound ("agape", "shalom"); Compare, Copy and Share as
  Image show it; Memory practises it, typed on a Greek or Hebrew keyboard
  of the app's own; the language page's Read in Greek (Hebrew) opens it.
  Word studies and cards give each word's meaning in its verse and its
  semantic domain (UBS's), and words in the same domain.
- The Manual (§15; its quick tips removed by the owner, §15.11): Reading
  settings → Help → Manual (12 pages with search, symbols drawn inline,
  links between parts). The words are `data/help.txt`: every round that
  changes a feature, a control's title or a place updates it (DESIGN.md
  §15.6).
- iPad, and any width (§17): one app for the iPhone and the iPad, every
  orientation (an iPhone not upside down), any window from 320 × 480,
  following the window's size class: a narrow window is the iPhone's app.
  The text is a column of at most 34 em (about 70 characters), centred; the
  place (chapter, verse, how far into it) is measured before a width
  changes and put back after, through rotation and resizing. In a wide
  window the sheets are form sheets and Reading settings a popover from
  Aa; the tray, capsules and mini player sit over the column. Keys: ⌘L Go
  To, ⌘F Search, ⌘] and ⌘[ chapters, ⌘← back, ⌘⇧B Library, ⌘, settings,
  ⌘⇧P Listen, ⌥⌘I Study, Space a page (the menu bar's Go and View menus);
  Practice's Return and ⌘1–⌘3. Study beside the text: on a wide window
  (from about 980 points) Study opens in a 390 point panel beside the page
  and stays on its verse while you read; a verse selected shows there; its
  bar has Show in Text and a close; the bar's Study button or ⌥⌘I shows
  and hides it, and it is remembered.
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
  (`tools/related.py`, MACULA's Proximity, CC BY 4.0); `data/lang/vocab.bin`
  how often each word occurs (`tools/learn.py`, from the app's own data;
  it prints DESIGN.md §14.0.3's table) and `letters.txt` the letter cards,
  written by hand (public domain). `data/orig.txt` is the Hebrew and Greek
  (Round 11: `tools/orig.py`, from STEP's TAHOT, the Leningrad Codex with
  the Qere read, and TAGNT's NA28 words; CC BY 4.0), keyed by the BSB's
  verses, with `data/lang/orig-words.bin` its words (each one's number,
  parsing, sense, flags, length and words.bin word), `orig-ketiv.txt` the
  Qere's Ketiv and `orig-accents.txt` the Hebrew with its cantillation;
  `data/lang/meanings.bin` and `meanings.txt` are each word's meaning in its
  verse and its semantic domain (`tools/ubs.py`, from the United Bible
  Societies' open dictionaries of Greek, after Louw and Nida, and Hebrew,
  SDBH), CC BY-SA 4.0 as their source is (`meanings-LICENSE.txt`); their
  markup is made plain (notes' marks dropped, verses named, Louw–Nida's
  entries as "LN 25.43").
  `tools/fetch.sh DIR make` downloads the sources, checks
  their sha256, and makes them all again.
  `lang.l8` reads the study data for the study screens, and
  `ios_study.l8` shows them; `orig.l8` is the Hebrew and Greek's portable
  part (which words are glossed and their glosses, a verse's words and
  Hebrew number, a word's popover, search by its letters).
  The BSB, KJV, WEB, ASV, YLT and the commentary are in the public domain;
  the cross references and STEP's texts are CC BY 4.0; UBS's meanings CC
  BY-SA 4.0.
- `text.l8` indexes it and lays a chapter out as runs of styled text.
- `ios.l8` is the app: the reader and its classes; `ios_look.l8` the themes,
  fonts and styles; `ios_store.l8` what is kept; `ios_select.l8` selection,
  the tray, the edit menu and jumps; `ios_sheets.l8` the sheets;
  `ios_versions.l8` the versions and switching; `ios_esv.l8` the ESV's
  client, cache on disk and the reader's states while a chapter comes
  (`esv_cache.l8` its portable rules);
  `ios_compare.l8` Compare; `ios_study2.l8` the Study sheet's segments;
  `ios_daily.l8` Go To's Ribbons and Reading Plan sections, the plans, a
  plan's days, A Chapter a Day and the reminder, and `ios_day.l8` a plan's
  day's reader (`plans.l8` their portable part: the plans, their days of
  passages, progress, a day laid out);
  `data/plans/mcheyne.txt` and `chrono.txt` the listed plans
  (`tools/chrono.py` makes the second from `chrono-order.txt` and checks
  that it has every verse once); `ios_ribbons.l8` the ribbons' rows, New
  Ribbon, Ribbon, the title's menu, the glyph and the toasts (`ribbons.l8`
  their portable part); `ios_share.l8` Share as
  Image; `ios_memory.l8` Memory's files, the tray's Memorize, the
  Library's Memory segment, Add Passage and Passage, and `ios_practice.l8`
  Practice (`memory.l8` their portable part: words and key letters, parts,
  hiding, the schedule, Today, the files and the reminder's words);
  `ios_learn.l8` Greek's and Hebrew's pages (the
  language page, the Alphabet and Sounds Written As, Your Words, Add Words
  and its preview, Verses You Can Read, Forms), cards.tsv and the voices
  (off, behind `LEARN_SPEECH`), and
  `ios_cards.l8` cards and Practise Reading in Practice (`learn.l8` their
  portable part: vocab.bin and letters.txt, cards on `memory.l8`'s
  schedule, what is known, coverage, a passage's words, readable verses,
  a card's verse, cards.tsv; `lang.l8` a lemma's forms and Greek for the
  voice); `ios_help.l8` the Manual and
  Reading settings' Help (`help.l8` its portable part: `data/help.txt` read
  and checked, the Manual's search); `ios_ipad.l8` the window's root (a container of the reader's navigation
  controller and, beside it, Study's), the width's changes and the place
  kept through them, the floating controls over the column, form sheets
  and popovers, the keys and the menu bar, and hover; `ios_beside.l8`
  Study beside the text (`text.l8`'s `column_width` is the column); `ios_orig.l8` the Hebrew and Greek's
  screens (its data at first use, Glosses and Show Accents, the glossed
  words' lines, a word's popover, the letter keyboard); `ios_demo.l8` (and
  `ios_demo3.l8` to `ios_demo17.l8`) the retained demo code (`ios_demo11.l8`
  Round 11's).
- The web (`WEB.md`): `html.l8` writes a chapter as HTML; `estimate.l8` estimates a chapter's height from its
  records (or counts its blocks for `tools/sizes.l8`'s sizes table, which
  the first paint estimates from); `text.l8`'s `text_load_book` holds one
  book with the whole Bible's chapter numbers.
  The app is `web.l8` (start, settings, keys, history, Go To),
  `web_reader.l8` (the scroller laid out by the height table, the window
  of chapters, the bar, the place, footnotes) and `web_table.l8` (the
  calibration, measuring, kept heights), running in the browser through
  the page bridge (`../web/dom.l8`, `web/dom.js`). `make bible-web` builds
  the site into `.build/bible-site` (`web/bible/`). The workflow's `web` job
  builds the site and uploads it as `bible-web-site`. Serve it locally with
  `node web/bible/serve.mjs`.
- `audio.l8` is recorded readings' portable part (sources, addresses,
  timings, which source a chapter is heard from, the cache's rules); `ios_audio.l8` the Voice screens, voices, the cache
  and downloads; `ios_listen.l8` both engines (AVQueuePlayer, no blocks;
  AVSpeechSynthesizer). `data/audio/<reader>.tim` are the verse timings
  and `henson.paths` eBible.org's file names
  (`tools/web_audio_manifest.py`); `tools/align.py` made the timings
  (wav2vec2 forced alignment of each recording to `tools/spoken.l8`'s text,
  `make bible-spoken VERSION=bsb`; see its docstring for running it), in a
  venv outside the repository; no audio is ever committed.
  `demo/audio/` holds the demo audio fixture (`make_fixture.sh`: a tone,
  its timings, the ESV's answers), enabled by `L8_AUDIO_FIXTURE`.
- `worker/` is the ESV proxy, a Cloudflare Worker (`worker.js`; `esv.js`
  turns the ESV API's HTML into our records), and `make_fixtures.mjs`, which writes the
  app's fixture (`ios/esv-fixture/`) for demos. It is deployed at
  smoothbible.com (below), with `/api/v1/esv/audio` (Round 7).
- `ios/` is what goes into the app besides its code: its Info.plist, icon
  (`AppIcon.svg`, drawn to `AppIcon.png` in Chromium, and as
  `AppIcon.svg#dark` and `#tinted` to `AppIcon-dark.png` and
  `AppIcon-tinted.png`, the tinted one on a transparent background),
  privacy manifest,
  named colors (`Colors/`: Paper, Ink, Faint, Accent, each light and dark),
  frameworks and resources.

```sh
tools/ios/build-linux.sh sim programs/bible/ios.l8 build programs/bible/ios     # anywhere
tools/ios/build-linux.sh device programs/bible/ios.l8 device programs/bible/ios # and the IPA
```

Both builds are linked with iOS 26.2's SDK, so on iOS 26 the app has iOS
26's design (the owner's choice). `build-linux.sh` needs no Mac: the compiler links the executable itself
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

GitHub builds it on pushes to `trunk` that change the app or its inputs
(`.github/workflows/bible.yml` lists the paths). Linux jobs build the iOS
assembly, simulator app artifact and iPhone IPA, and build the web site.
The IPA is also pushed to `ci-bible-ipa`. Bible tests, data-check jobs,
browser checks and simulator screenshot runs have been removed.

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

Since the web reader (WEB.md §W2.1a), the Worker's static assets are
`.build/bible-site` (the site's pages and `/read/`), so every deploy is
preceded by `make bible-web` at the repository's root; deploying it puts
the web reader live, which needs the owner's consent like the rest. Check
afterwards that `curl -sI https://smoothbible.com/read/bsb/john/3` carries
the `Content-Security-Policy` and that `/` and `/api/v1/status` are as
before.
