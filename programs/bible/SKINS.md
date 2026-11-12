# Platform skins

Core owns app behavior and screen models. Each platform supplies
presentation and services. Every platform (the web, Android, the terminal
and iOS) runs core on core's host (`core/host.l8`) and talks to it only in
the line protocol: core has no platform's own path. This file describes the
models and protocol used by the current implementations.

## Layers

| Layer | Where | What it is |
|---|---|---|
| The Bible and what is kept | `core/*.l8` (text, layout, store, plans, memory, ...) | Data and rules. No platform services. |
| The app | `core/ui.l8`, `core/skin.l8` and what it imports, `core/prefs.l8` | Every screen as data, what each action does, the settings, and the app's rules and words. No platform. |
| A skin | `ios/`, `android/`, `web/` | Draws screens and a few views of its own, gives core the platform (files, network, voice, sharing). |

What `core/skin.l8` imports, besides the screens' own files
(`lessons.l8`, `forms.l8`, `verse_study.l8`, `tray.l8`, `note.l8`):

| File | What it holds |
|---|---|
| `practice.l8` | Practice: a session's queue, steps, levels, typing, grades, each word's look, the buttons, Listen and Echo's verses and clips; its screen (`SCR_PRACTICE`) |
| `day.l8` | A plan's day: its rows, title, Mark Read, the day's end; following, stopping and marking plans; which days get reminders; its screen (`SCR_DAY`) |
| `reading.l8` | The reader's rests: chapters read (20 s at rest, end seen), the carried ribbon moving, dwelling into the history |
| `jump.l8`, `back.l8` | What a jump does (the way back, the history, the ribbon put down), the capsule and its return, opening a ribbon |
| `listen.l8` | Listen's words, what comes next, listening through a day |
| `preview.l8`, `footnote.l8` | A reference's preview and a footnote: what they show; their screens |
| `share.l8`, `word.l8`, `keys.l8` | The share card's words; a Hebrew or Greek word's popover; the keyboard's commands |
| `esv_client.l8` | Asking for the ESV's chapters (one at a time, the client's limit, resting, the reader's window) and taking them |
| `words.l8` | Words no one screen owns: counts, labels, toasts, the controls' titles |
| `kept.l8` | What is kept: the files (as the iPhone names them), what goes in each, saving and loading them; a host only reads, writes, adds to and deletes one by name (`kept_store`) |
| `shelf.l8`, `shelf_screens.l8`, `shelf_bible.l8` | The Bookshelf: modules from CrossWire's SWORD library (`programs/sword`), what is installed, the catalog, downloads, a document's page and a module's screens, and a Bible made a version |
| `documents.l8` | What can be read as Go To lists it, wherever it is kept: one row model, how a query finds documents and orders them, Documents and Browse, where a pick lands (the page or the panel), and a document on its way to a pane (an arrival) |

A skin decides **how** things look and move (a sheet or a pushed screen, a
switch or a checkbox, the platform's fonts and icons). Core decides **what**
is there and **what happens** (which rows a screen has, their words, what a tap
does to the app's state, where the reader goes next).

## A new skin: the contract

A new platform implements the shared models and the services below. Keep
feature rules in core and platform operations in the skin. The web provides
a concrete implementation: `web/main.l8` (the platform) and
`web/page/skin.js` (the skin).

**1. The platform, in L8** (core's host, `core/host.l8`, does the rest):

- `kept_store = KeptStore { read, write, append, remove }`: one named file
  (`kp_name`) read into `fbuf`, written from it, added to, deleted
  (`core/kept.l8` names them and says what goes in each).
- `host_io = HostIO { ask, http, file, fetch, read_kept, read_kept_range, keep, say }`: a data file asked
  for by name (the site's `data/` names: `bsb.folio` ... `ylt.folio`,
  `orig.folio`,
  `lang/*`, `help.txt`, `xrefs.bin`, `mhcc.folio`, `audio/*.tim`,
  `audio/henson.paths`), a GET, a file or answer's bytes, a recording
  fetched into a kept file, lines to the skin. `fetch` (a GET into the
  kept file named, written whole only when the answer is 200, and kept out
  of backups) may be `null` where a platform cannot keep recordings; core
  then offers no Downloads. `read_kept` reads a kept file back as an id
  (answered `got ID SIZE`, -1 when there is no such file, its bytes by
  `file`): the Bookshelf's catalog and packages, which `fetch` kept.
  `read_kept_range` reads COUNT bytes from OFFSET of one the same way
  (SIZE fewer at the file's end): a span of a module's text, so that a
  15 MB file is never read whole. `keep` writes bytes as a kept file of
  the platform's (in place of any, and out of backups: they are copies of
  what is online) and answers `kept ID OK` (1 written whole, 0 not): a
  module's files as its package is unpacked, and a Bible's records.
  Without all four, core offers no Bookshelf.
- `hs_start()`, then what the platform is: `sk_device` (its name: "Device",
  "Phone"), `sk_follows_text_size`, `sk_fonts` (its reader's faces, in the
  settings' order), `hs_notify_off` (where notifications are turned back
  on, if not its Settings).
- Its lines, into `hs_inbox` (the web's `bw_take`), then `hs_lines(n)` and
  `hs_after()`: from a loop that waits for them, or from its callbacks (the
  iPhone's, where every line comes in one). A data file asked for is
  answered `got ID SIZE`; core's host then reads it through `file`
  straight into the dataset it is part of. Ids from 1000000 are the
  Bookshelf's (`core/shelf.l8`): its fetches, and its kept files read back
  (from 1999999); a host passes them on as it does the others.
- Its own lines in: `got ID SIZE` (a data file came; -1 none), `http ID
  STATUS SIZE` (an answer came), `api BASE` (the site's `/api/v1/`),
  `fetching ID GOT TOTAL` (a fetch's bytes so far, TOTAL 0 unknown; as
  often as it likes), `fetched ID STATUS BYTES` (its end: STATUS the
  answer's, 0 none; BYTES the kept file's size), `kept ID OK` (a `keep`
  done: 1 written whole, 0 not), `network KIND` (as it
  changes: 0 none, 1 not metered, 2 metered; until it is said, not
  metered). Core's host keeps the chapters held and the books asked for
  (`core/held.l8`), fetching one chapter at a time.
- Core's data are datasets (`core/datafile.l8`, `TextData` in
  `core/text.l8`, `LanguageData` in `core/lang.l8`, the Manual, the
  plans' files, the recordings' timings and paths, the original's words):
  each made in an arena of its own when its file comes, replaced whole
  (the one before let go) when it comes again, and read only borrowed, for
  what an operation does. Nothing a skin is given points into them.

**2. The skin draws** what core describes:

- Screens: `screen` ... `end` with every row kind, and these `CUSTOM_`
  kinds where the plain row won't do: `CUSTOM_SWATCHES` (colors to choose),
  `CUSTOM_CARD` (Share as Image's card, drawn at its pixels),
  `CUSTOM_FONT` (each font in its own face), `CUSTOM_HIT` (a verse found;
  its value `HIT_GREEK` or `HIT_HEBREW` for the original's words),
  `CUSTOM_DOWNLOAD` (a book of recordings coming, Voice's Downloaded
  Books: its value the thousandths come, drawn as a ring in the row's
  leading slot, in place of its icon and as wide, with nothing at its
  end; a terminal's circle ○ ◔ ◑ ◕ ●).
  The others may show as their kind's row. Their placement: `present`,
  `push`, `present_over`, `panel`, `update`, `refill`, `retext`, `blur`,
  `focus`, `reveal`, `pop`, `pop_to`, `close`, `dismiss`; the skin's own
  Back says `closed ID`. A screen made again as data comes (the catalog,
  a count, the panel's chapter) is sent as an `update` only if its lines
  changed; the skin keeps the rows and buttons that are the same (the
  web's `morphChildren`), so nothing in sight is taken out and put back.
  `reveal ID` brings the focus row's words (`focus
  N 4 FROM TO`) into sight, scrolling as little as it can: none if they
  are in sight already.
- The two panes (below): `reader`, `line`, then `part` lines as it asks
  (`want`), `go`, `halt`, `forget`, `link`; it says where each is read
  (`at`, `rest`, `moving`), and moves the one not led itself.
  A document on its way to a pane: `arriving`, `arrived` (a hairline
  under that pane's bar). With them `look`, `title`, `version`, `goto`,
  `page`; `selection`,
  `carried`, `hearing`, `back`, `wake`, `tick`, `jumped`.
- The tray (`tray`, `tray_away`: screen 0), the title's menu
  (`titlemenu`, `menuact`), toasts (`toast`), the small player (`player`).
- Icons by their SF Symbols names (its own drawing of each), runs by their
  styles (`STYLE_*`, `RUN_*`), `keys ACTION` (a screen that takes typed
  letters: Practice's).

**3. The skin does** what only a platform can, each a line or two:

| What | Lines |
|---|---|
| Begin, and its appearance | `start W H DENSITY DARK TZ`, `version ABBR`, `dark`, `away` |
| Taps | `tap`, `act`, `query`, `scope`, `text`, `submit`, `tapverse`, `tapnone`, `trayact`, `word`, `footnote`, `preview`, `esvact`, `versestudy`, `back` |
| Keys | `command`, `commands` → `key NAME MODS` |
| A panel beside the reader | `panelfits`, `panelvisible`, `tap shelf`, `tap full`, `beside`, `panelmake`, `panelanchor` |
| Recordings | `audio_play`, `audio_stop` → `audiotime`, `audioended`, `audiofailed`; an address `kept:NAME` is the kept file NAME (a chapter core holds), and one that isn't there fails, so core plays it from online |
| Its voice | `voices` (once); `say`, `speech_stop` → `spoke`, `spoken` |
| Listening's controls | `listen_pause`, `listen_resume`, `listen_stop`, `follow`; `listenplay`, `listenpause`, `listenprev`, `listennext`, `listenstop` (its own player's too: a lock screen's) |
| Time | `timer TOK MS` → `timer TOK` |
| The screen kept on | `awake MS` |
| Reminders | `notify_ask` → `notifyok`; `notify_clear`, `notify`; one opened → `reminded` |
| Sharing | `copy`, `share`, `share_image`, `savefile`, `url` |

**4. A skin may ignore any line it doesn't know.** Some only say what
changed (`plan_stopped`, `marked`, `ribbon_color`, `chosen`, `searched`,
`remind`, `remind_time`, `voice`, `audio_source`, `cellular`); core's host
does `esv_want`, `esv_search`, `mm_fetch`, `pins_changed`, `export`,
`settings`, `download` and `download_delete` itself, so they come only from
a core without it
(`tools/skin_text.l8`). `open_settings` comes where the platform doesn't
give `hs_notify_off` (where notifications are turned back on: the web's):
it opens the platform's notification settings (Android's, the iPhone's).

What core's host turns on for its skins: ribbons and plans, Listen, Keep
Screen On, reminders, Share as Image, the Manual and Acknowledgements.
Downloads (`sk_has_downloads`) need a platform whose `HostIO` has `fetch`;
the web's fetches through the site's Worker (`/api/v1/audio/relay`: the
recordings' hosts don't let pages read them) and keeps them in the
browser's cache (`sb-held`), each played from a blob address.

## Screens as data

A screen is built by core when it is shown and again whenever core says it
changed (`core/ui.l8`'s records; `core/skin.l8` and the files it imports
build them). It is a title, sections, and rows, and what is around them:

- **Screen**: an id (its instance, from core), its kind and argument (Go
  To's chapters of book 42), a title, and optionally: a search field (its
  placeholder, its words, scopes), words above its first section (`intro`,
  rich), a word as its heading (`hero`: Study's, Forms'), segments (the
  Library's Highlights, Notes, Bookmarks, Memory), a filter by color, a
  sort, a confirming button (New Ribbon's Add, off until it can be), a
  button at the left of its bar (a note's Cancel), a button with a menu
  (History's Clear), buttons at its foot (`tool`s: their place left, middle
  or right, a title or an icon, a style, and a menu; or segments), an index
  down its side (a concordance's books), and what it shows with no rows. A
  screen may be a *page* (its rows paragraphs, no lines between them: the
  Manual's, a commentary's, Practice) or a *grid* (its rows square buttons:
  a book's chapters).
- **Section**: a header and a footer (either may be empty), faint words
  after its header, a button in its header, a credit under it (the ESV's),
  over a grid its columns' names, and rows; a section may be *lazy* (its
  rows made as they are wanted: a concordance's thousands).
- **Row**: a kind, and what it shows and does:
  - `item`: title, detail (a subtitle, or a value on the right with
    `value`), icon, accessory (`more` for a disclosure, `check`, `info`,
    `done`, `link`), disabled, destructive. A tap is its action.
  - `toggle`: title and on/off. Changing it is its action with the value.
  - `choice`: title and options (a segmented control on an iPhone, a
    spinner elsewhere), the one chosen.
  - `slider`: title, minimum, maximum, value.
  - `field`: placeholder and text (its words go back as `text`, when its
    editing ends or, live, as they are typed).
  - `time`: a time of day (minutes past midnight: a reminder's).
  - `button`: a full-width action (Delete Ribbon).
  - `text`: a page's paragraph, its title its words (by its runs), with
    links in it (UTF-16 places, each an action and argument) and maybe a
    heading.
  - `tiles`: the interlinear's words, its cells tiles (a word, its
    English and transliteration, what is hidden), in lines as wide as the
    list; its value 1 lays them right to left (the Hebrew's order), 2 makes
    them large and centred (an exercise's word, a sound to a tile, and its
    choices).
  - `custom`: a view the skin makes itself (below), with an argument.
  Any row may also have: a circle at its start (a plan's day), a glyph in a
  column of its own at its start and words at its end (a letter's example),
  a note under its detail, faint words after its title, a ⓘ doing an
  action, actions a screen reader offers (and shown as a menu at its end),
  an action its swipe does, a spinner, and a grid's cells (Forms).
- **Text** is plain UTF-8, or set by runs: `END:STYLE` pairs (UTF-16 places)
  using the reader's styles (`STYLE_*`, text.l8) or core's own (`RUN_*`,
  ui.l8: a verse's number, Greek and Hebrew, a transliteration, faint,
  strong, plain, small, small and underlined (a quiet link:
  `RUN_SMALL_UNDERLINED`, drawn as small where a skin has no underline),
  italic, the accent). A row's title, detail and side
  words, the intro and the hero's line may have runs; a detail may have
  marks instead (the words a search found).
- **Icons** are named as Apple's SF Symbols name them (`book`,
  `magnifyingglass`; `ribbon` is the app's own glyph); each skin maps the
  names it needs to its own icons, or shows none.
- **Accessibility**: a row may carry a spoken label, a hint and named
  custom actions, which the skin exposes as its platform does.
- **Actions** are numbers chosen by the screen's kind: `(screen id, action,
  argument, value)`. A skin never interprets them; it hands them back.

A screen belongs to a *group*: the sheet (0) or the panel beside the
reader (1: what is read with the Bible, `core/beside.l8`). Closing one lets
its group go, the other kept; a screen may also be presented over the sheet
up (a note over the Library), which stays. A skin with a panel shows it at
the reader's right where a column fits and under the reader elsewhere,
the reader still scrolling, and says so (`panelfits 1`); the panel's
screens are a stack of their own, a `push` of a group 1 screen going on it
whichever screen acted: its reader, and Study over it. Every skin has
one; one whose window is too small for it at times says `panelfits 0`
then, and the bar's panel button opens Go To aimed at the page.

## Panes

The page and the panel's reader are two panes: pane 0 the page, pane 1 the
panel's reader (the screen whose `reader` line says so). Each reads a
document a part at a time: the page the Bible, or a commentary (Swap Panes,
in the reader screen's menu, trades what the two read, each going to the
other's place; the bar's `version` then names the commentary); the panel a
version or a commentary. The reader screen is one row of chrome, drawn
as the page's bar is on that skin, so that the two panes are named
alike: its title is always the chapter at its reading line, and its
`left` the name of what it reads, as the page's `version` names the
page's (a version's name, King James Version; a commentary's short title,
Spurgeon's Treasury of David), whose tap presents Go To aimed at the
panel (below). A skin draws them as the page's title and version: the
chapter in the title's type, the name small and faint under it, cut at
its end where it must be; a chevron after the chapter where the page's
title has one. Its tools are Link (prominent while linked) and a menu
(`ellipsis`: Swap Panes, Full Screen or Beside the Page, Close Panel;
Full Screen only where the skin's panel may fill the screen, `panelfill`),
drawn as the page's bar's glyphs are, Link lit while linked as the
page's panel button is while the panel shows; where the page's bar puts
glyphs at both sides (the iPhone's), Link takes the outer left place and
the menu the outer right.
The reader is the panel's first screen: it has no Back. A commentary on the page has no verses to select:
core lets a `tapverse` on it go. Core and the skin divide the work by what each
knows best, and speak across the line in the document's terms, never in
pixels:

| Core (`core/panes.l8`): the documents | The skin: the platform |
|---|---|
| What a part holds: its words, runs, anchors; a commentary's runs of chapters without comments | Laying a part out and measuring it: fonts, the text's size, right to left, line breaking |
| Which place in one document is which in the other (verses, versification, which comment covers which verses): the *link map* | Which parts exist as views, kept in place as others come and go above them |
| Who may lead, linked or not, how each document follows (verse by verse, comment by comment) | Scrolling, its physics and glides, Reduce Motion, telling a finger from an animation, the frame clock |
| Where a jump goes (Go To, a link, the way back, a ribbon), history, reading counted, the place kept | Following frame by frame, by the link map, at its own geometry |
| Where each pane is read (its reading line) | Selection, the text's menus, VoiceOver and TalkBack, copying |

**Places.** A place is a chapter, an anchor of it and how far through that
anchor's span: `C I FRAC`, I counting the chapter's anchors from 0 (-1:
above its first), FRAC thousandths. A part's *anchors* are its `verse`
lines, in order: a version's verses; a commentary's comments' first verses
(one may come again, where its commentator goes through the verses again).
An anchor's span runs from the top of the line its words begin on to the
next anchor's (the chapter's top before its first; the next chapter's top
after its last). Every skin turns its own layout into places and places
into its layout; no length crosses the line. Both ways are one rule,
core/follow.l8's `follow_place_y` and `follow_line_place` (an anchor
whose start is within a point below the line is the one the line is at;
thousandths rounded), checked by `link_cases`' `place` and `at` cases:
a pane sent to a place tells that place back, and a `go` is held as
parts come in about it until a hand moves the pane, so that Swap Panes
(each document to its own place, anchor and thousandths, in the other
pane) leaves both where they were after any number of round trips. For
that, a skin tells both panes' places as they are (`at`, whether their
anchors changed or not) before an act on the panel's reader (Swap Panes,
its Link and menu), and a pane still where a `go` put it tells the place
it was sent to, not the place measured again from its layout (a chapter's
top is laid out under the bar, not at the reading line; offsets fall on
the screen's pixels). A pane whose parts were all forgotten (`forget P
-1`) tells no place until core's next `go` for it, or a hand moves it:
until then its reading line is the old document's place in the new one's
parts. A panel sent to a verse before its document can say its anchors
(a commentary's file still opening, a version not read yet) is sent to
its chapter's top meanwhile, and to the verse once they are known; core
takes no `at` for it until then, or until a hand moves it (`moving`).
The page reading a commentary keeps its comment (`pageAnchor`) and goes
back to it at a launch; until the commentary's file is open core sends
the page no `go` at all, so it shows nothing at a wrong place. A pane at
rest keeps its place as a sent one (the iPhone): a turn of the window, a
launch's sheet or an inset put that place back at its reading line, and
a turn holds both panes as a jump does, until a hand moves either.

**Parts.** A skin asks for the parts near what a pane shows, `want P C K`,
and core answers each:

- `part P C K N` TEXT: part K of chapter C, the chapter in N parts (0: not
  known yet, a commentary still opening); then `layout ORIG RTL VERSELINES
  OPENER LABEL`, `coming` (it holds its place until it has been read: sent
  again when it has), `name` TITLE, `span A B STYLE PARA`, `verse V A B`,
  `link A B KIND ARG`, `gloss A B`, `mark V HEX BOOKMARK NOTE`, `gap C0 C1`
  (a commentary's run of chapters it says nothing on: this one part stands
  for them all, sent as C0's to a `want` of any of them), then `anchor V K
  AT` for every anchor of the chapter in order with the part it is in and
  how many bytes of the part's source it begins after, then `sizes B...`,
  how many bytes of source each of the chapter's parts is (a part's words
  are about as long as its bytes: following guesses by them where parts
  not laid out would be, below), then `end`. Places A, B are UTF-16 units
  of the part's words.
- `forget P C`: pane P's parts of chapter C (-1: every chapter) are to be
  asked for again (the look, the version, what the panel reads changed,
  or an update of its document swapped in: then a `go P C I FRAC 0` to
  the place it said last follows, and its parts come as they are asked
  for, none `coming`); those shown stay until the new ones come.

A part sent again replaces the one shown where it is; a part coming in, or
changing height, above what is in sight never moves what is in sight.

**Where each is read.** `line P THOUSANDTHS`: a pane's reading line, that
far down what of it is in sight (the page's a third of the way, the
panel's at its top). The skin says where each pane is read, in places:

- `at P C I FRAC [NAMED]`: its reading line's place, as the anchor there
  changes and at rest (not each frame). Core keeps the page's as the
  reading place and names the panel's chapter in its title: NAMED, if the
  skin sends it, else C. NAMED is the chapter whose opener or words are
  first in sight below the pane's bar (the space after a chapter's last
  words, above the next one's opener, is the next one's, though a reading
  line in it is still the place before).
- `moving P MS`: a finger (or a key) began to move it: it leads.
- `rest P ENDS_HI MS`: it stopped, ENDS_HI the last chapter whose end is in
  sight (-1 none).

**Moving it.** `go P C I FRAC MODE`: a pane to a place; MODE 0 there at
once (a jump: Go To, the way back), 1 brought there (the skin glides if it
is near, else is there at once, at once where motion is reduced), 2 (the
panel's reader, linked: opened, its document come, the app restored) there
at once and then where following's rule puts it for the page, at once and
again as parts come, until a hand moves either pane (Panes: Linked). A pane
not laid out yet keeps it until it is. `halt P`: its glide stopped.

**Arriving.** A document picked for a pane that isn't on the device yet
(Go To lists what can be read wherever it is kept) is fetched and made
while the pane goes on showing what it shows, and changes to the new one
only once it can be read there at once:

- `arriving P THOUSANDTHS`: a document is on its way to pane P, THOUSANDTHS
  of it come (0 to 1000; it may stand still, and it is said again as it
  grows, about a fiftieth at a time). Said at once as it is picked, before
  any other line about it. From then the pane's name already names the new
  document (the page's `version`; the panel reader's `left`), but the pane
  still shows, scrolls and follows by the link map the document it showed:
  no `forget` or `go` comes for it until it has arrived. The skin draws one
  hairline, 1 point, along the bottom edge of that pane's bar (the page's
  top bar; the panel's one row), in ink at 30% (not the accent), filled
  from the leading edge to THOUSANDTHS of the bar's width. It is the only
  progress shown, and only while something arrives.
- `arrived P`: nothing is on its way to pane P now: the hairline fades out
  over 0.2 s (gone at once where motion is reduced). Arrived, the change has
  come just before it, as for any pick of a document here: `forget P -1`
  and a `go P C I FRAC 0` at the place it was sent (the parts there
  already read, so they come as they are asked for), and, for the panel,
  its reader screen made again (`panel`, or `update`); for the page's
  Bible, `reader`, `look` and `version` as a version changes. Failed (the
  connection lost, the server's error), the pane's name is said again as
  it was (`version`, the panel's `update`), and one `toast` says
  "Couldn’t open TITLE."; nothing else changes.
- A second pick for the pane meanwhile sends it there (a document here, at
  once, then `arrived P`; another on its way, `arriving P` again with its
  own share); the first goes on arriving out of sight, unsaid.
- The panel sent a document while it showed none (closed, or nothing read
  there) opens at once as its reader, named for it, and its pane's one
  part is a faint line, "Opening…", at its reading line (its top), in the
  style of a commentary's "No comments on Genesis to Job": a `part 1 0 0
  1` standing for every chapter (`gap 0 LAST`), with no anchors. The skin
  needs nothing of its own for it; `at` lines while it shows are let go.
  Arrived, `forget 1 -1` and `go` bring the document's own parts.

**Linked.** Linked (`reader 1`), the pane a hand last moved leads, and
the skin keeps the other's linked section in sight by the link maps
(below).
Core sends a chapter's map as the panel's document or the chapters near
the place change:

- `link C MODE COMMENTS`, then `match I0 I1 J` lines, then `end` (core
  says the maps of the place's chapter and two either side, as the place
  comes near them; a skin keeps the maps of at least the eight chapters
  said latest: core says a map again as its chapter comes near again): in
  chapter C, MODE 0, two
  versions, the page's anchor I0 (I1 the same) goes with the panel's
  anchor J, verse by verse (a verse one side lacks has no line); MODE 1,
  a version and a commentary (COMMENTS the pane the commentary is in, the
  other the version's), the version's verses I0 to I1 go with the comment
  J that covers them (several comments may cover a verse, where its
  commentator goes through the verses again). A chapter of a commentary's
  run without comments has no lines: the run's part is the follower's
  place wherever the leader is in its chapters. Two commentaries have no
  map.

Following goes by *sections* linked by the maps, and is symmetric: which
pane a hand moves, and whether either reads a Bible or a commentary, makes
no difference. The page is the top pane (beside the panel, the left one),
the panel the bottom. A section is a verse, or a comment; a match links a
verse to the other version's verse, a verse to each comment on it (a
commentator going through the verses again links a verse to several), a
comment to the run of verses it is on, a chapter of a commentary's run
without comments to that run's part, and a chapter's top (above its first
anchor: its number and headings, a psalm's title, a commentary's
introduction) to the other's. The rule (core/follow.l8, the same on
every skin; web/page/follow.js and Android's Follow.java are its ports):
the section under the top pane's top edge (the top of what of it is in
sight), or, if nothing is linked with it, the linked section nearest the
edge, has a section linked with it as much in sight in the bottom pane as
can be: wholly, if it is shorter than the pane; filling the pane, if it is
taller (any one of several will do). While that holds, nothing moves: no
proportion through a verse is kept.

The rule is taken only with the sections it is about known: while the
chapter at either pane's top edge has a map with matches, and the other
pane doesn't know that chapter's anchors yet, nothing moves, and the
other pane asks for its first part (which says them), following again as
it comes. Else the chapter would have no links, and the nearest linked
section would be another chapter's: the panel brought to Psalm 30 while
the page's top edge is in 29:8.

When it doesn't, the pane the hand isn't moving moves by as little as
makes it hold, starting in the frame it broke in:

- The page moved (`follow_bottom_move`): the panel brings the linked
  section into sight with the least scroll, of several the nearest (a
  short one wholly in sight; a tall one filling it: going on, its start at
  the top; coming back, its end at the foot).
- The panel moved (`follow_top_move`): the page stays while its section at
  its top edge has one linked in sight below; else it moves the least that
  puts at its top edge a section with one linked in sight below (that
  section's start at the edge, if it is shorter than the page; the page
  filled with it, if taller). None being in sight as it should be, the one
  whose linked section shows most below is taken; none showing at all, the
  page stays.

The moving pane glides there quickly (`follow_glide`: each frame closing
all but e^(−t / 50 ms) of the way, so most of it at once and slowing; about
a quarter of a second), a new place mid-glide glided to from where it is.
However far it has to go, it is there 0.3 s (`FOLLOW_GLIDE_MOST`) after its
place was last new: the way left shrinks at least as the cube of the time
left, so a long glide slows smoothly to its end in time;
where motion is reduced it is there at once. Every skin steps the glide
itself, a frame at a time, by `follow_glide` (not a platform's scroll
animation), so that the follower keeps up while the hand's pane moves
and is done soon after it stops. The positions of sections not laid out yet
are guessed: an anchor whose part isn't laid out counts where it would be
were each part between it and what is laid out as tall for its bytes
(`sizes`) as the parts of its document measured so far are on average (a
chapter whose sizes aren't known yet: as tall as the laid-out parts are on
average), every part of the chapters following goes by guessed however
long they are, and the anchor as far down its part as its bytes into it
(`AT`). While the panes rest, a skin measures those parts out of sight,
nearest first, asking for them as it needs, so that a section a pane must
glide to is known, not guessed; measuring moves nothing shown.

A jump (Go To, a link, the way back, Swap Panes) moves both panes: core
sends a `go` for each, and each is held where its `go` puts it (as a `go`
holds a pane's place as parts come in about it). The rule moves neither
until a hand moves either pane, so Swap Panes and the way back leave
both panes where they were. The panel's reader opened, its document
come, or the app restored has no jump to hold: core sends its `go` with
MODE 2, and the skin puts it where the rule says for the page, at once
(not glided), and again as parts come and tell it better, until a hand
moves either pane or the panel comes into sight. A document picked for
the panel opens at the page's place while linked, at the panel's own
place while not (its nearest chapter, by the run rule, if it has none
there); until core has sent the panel's reader its `go`, a place the skin
tells for the panel is the old document's and core takes none. Opening, nothing in the panel moves
as it comes: its reader is laid out at its place before its first frame
shows (the iPhone from iOS 26 out of the window, then shown once placed,
at most half a second; elsewhere it slides in only once laid out there,
at most half a second); once in sight, the rule is checked once more
when it is still, a glide if it must move; closing, it goes the way it
came. While what a pane reads changes (Swap Panes, a document picked),
the iPhone keeps a picture of what each pane showed over it, and takes
both away in one frame once each is laid out at its place (at most half
a second, or a second and a half while a pane's parts in sight are still
coming, as a commentary's file still opening after a launch makes them),
so no frame is blank; a pane uncovered before its parts came goes to its
place by one quick glide as they come, never a jump. A pane moved by the app (the status bar, a key's
page) leads as a hand's move does.

Once both panes rest (and no jump holds them), the rule is checked
again, and again as parts measured ahead tell where sections are: the
pane that didn't lead moves if the rule doesn't hold.

While the panel fills the screen, the page is not moved: it is where it
was when the panel is beside it again. If a hand moved the panel while
it filled the screen, the page then follows the panel; otherwise the
page leads, and the panel follows it.

The reading line (`line`) is what `at` and `go` place and what Go To
leaves a verse at; following doesn't use it: it goes by the top edge.

The panel's title names its chapter as it changes, while a hand moves
either pane too, as the page's title follows its scroll.

These rules are the skins' each, so each is checked against core's: core's
`link_cases` tool writes cases (a chapter's map or several, both panes'
anchor positions, where each pane's sight is, and which pane moves to
where; a glide's frames) that every skin's tests read and must match to
within a hundredth of a point (`make bible-follow-test`).

**How each skin draws a pane.** With its platform's own tools wherever they
measure exactly:

- The iPhone: a `UIScrollView` of `UITextView`s, one a part (TextKit 2
  measuring each whole), so each part keeps UIKit's selection, menus,
  Dynamic Type and VoiceOver; what comes in above is offset at once.
- The web: a `section` a part in the document's flow; the browser's own
  scroll anchoring (`overflow-anchor`, done by hand where a browser lacks
  it); `content-visibility: auto` on parts far from sight.
- Android: the framework's recycling list (a `ListView`: the app uses no
  AndroidX) of `TextView`s, one a part, each measured exactly as it comes
  into the window, so TalkBack and selection are the platform's.
- The terminal: its own reader of lines, a part's lines measured in rows.

## Views a skin makes itself

Every list in the app is core's, and so are (2026-10-22) the chapter grid,
a verse's Study (the interlinear, cross references, the commentary), a
word's definition, the Manual's pages, the note editor, the selection
tray and its menus (`tapverse`, `trayact`), the title's menu (`titlemenu`,
`menuact`), Practice (below), a plan's day, a reference's preview and a
footnote. What each skin still draws itself is drawing only, from core's
models, words and rules:

1. **The reader**, made twice (the page and the panel's: Panes, above):
   parts as laid-out runs (`ChapterLayout`, `measure_chapter`; `part`,
   `span`, `verse`, `link` and `mark` lines), continuous; what it laid
   out, where it is read and its rests told back.
2. The back capsule (`back` WORDS), the mini player (`core/listen.l8`'s
   words), the share card (below), the text's own menu
   (`core/tray.l8`'s commands), a word's popover (`core/word.l8`), toasts
   (`toast`).

Share as Image is core's composer (`core/share.l8`'s `SCR_SHARE`) for a
skin that draws cards (`sk_has_card`; core's host says so): Share on
verses that fit a card opens it (else it shares their words). Its shape
is the screen's segments, its background a swatches row, then Share
Image and Share Text. The card is a `custom` row of `CUSTOM_CARD`: its
title the reference, its suffix the version, its detail the words with
runs `RUN_CARD` + the piece's kind (0 words, 1 supplied, 2 His words, 3
both, 4 a verse's number) + 8 (an indented line) + 16 (Greek) + 32
(Hebrew, right to left) + 64 (a divine name's small capitals), its
options the colors (background, words, faint, accent), its value the
shape and its trailing core's measures (`W H MARGIN GAP REF VERSION MOST
LEAST STEP`): the skin sets the words at the largest size from MOST to
LEAST that fits above the reference, lines 1.35 high (1.5 in Hebrew),
centered, and draws them at the card's pixels. Share Image says
`share_image` WORDS: the skin shares the card it drew last (the web: the
page's share of a PNG, else a download).

A reference's preview is core's (`core/preview.l8`: its verses, each
chapter's first and last, at most 80, the words around them): a screen, a
page of the verses in the reader's styles and Open in Reader.

## Go To and what can be read

Go To (`SCR_GOTO`) is one screen wherever it opens: the same title (Go
To, no subtitle), sections, rows and marks, always presented (a sheet,
group 0; never pushed, so it has no Back) and opened at its top (no
`focus`). Its screen's argument says only where a pick lands: `GOTO_PAGE`
(0: the bar's title, `tap goto`) or `GOTO_PANEL` (1: the panel reader's
name, or `tap shelf` with nothing read there yet). In a wide window a
skin may anchor it, as a popover, to what opened it (the page's title or
the panel's name, by the argument); nothing else differs. Its rows, and
those of the screens pushed over it (a book's chapters, a document's
page), act for where a pick lands; core works that out, and the skin
hands the actions back as for any screen.

- Nothing typed: Ribbons and Reading Plan, Recent, a Books of the Bible
  row (the books' screen, `SCR_BOOKS` 69, pushed: Old and New Testament
  sections, a row a book; typing finds a book too, so Go To doesn't list
  them), Documents (what is read: the page's document, the panel's, then
  the others read, the latest first, up to six with the Bibles that come
  with the app), Browse (a row a kind with documents, and Languages, each
  with a count at its right; a tap puts its word in the field, `refill`
  then `retext`, as if it was typed).
- Typed: the reference (a row to go there: also a chapter and verse
  alone, `3:16`, in the book read, and a book's name misspelt before a
  chapter, `jhon 3`, `pslam 23`, a letter wrong, missing, extra or two
  swapped, and numbered books' name without the number before a chapter
  as the first's, `cor 13` 1 Corinthians 13), Books of the Bible (those
  whose name, or a short name, the name typed begins, a numbered book's
  past its number too, `cor` 1 and 2 Corinthians, in the Bible's order,
  the reference's own among them; none when that is the reference's book
  alone, `rom`, when a chapter typed chose the book, `john 3:16` but not
  `cor 13`, or with words after the numbers), then the
  documents by kind (Bibles, Commentaries, Dictionaries, Devotionals,
  Books; each word of the query beginning a word of the title, short
  name or module's name, an apostrophe in either passed over: `pilgrims
  progress`, `calvins`), ordered open in a pane, read, coming with the
  app, in the reader's language, the others; three a kind then `Show All N` (five for
  a language named; twelve for a kind named alone, then its other
  languages, rows refining the query); for "languages", a row a language
  (its own name; its English name and a count); then, for three letters
  or more and no reference to a chapter, what the words find
  (`core/find.l8`, by the documents' word indexes: folio's README), the
  last word typed taken as a word's beginning once it has three letters
  (shorter, after other words, it is left out until it does), a word also
  found with an s after it or without the s it ends in (`lords prayer`).
  Verses: every version here with an index searched, each verse once (the
  version read's, else the first other's, named after the reference:
  `John 4:10 · KJV`); a version not open is searched by its index alone,
  its file kept packed and a chapter decoded only for a verse shown. The
  first three as they rank: the words in a heading over the verse (more
  if the heading is the words: `love`, 1 Corinthians 13), as a phrase in
  it, in the chapter read (else its book, its testament), weighed so that
  the chapter read with the phrase outweighs a heading elsewhere; the
  version read's first at each; the words marked, a tap going there as Go To's places
  do, and `All N Verses`, Search pushed over Go To with those words (its
  scopes, recent searches and the ESV's own search there). Commentaries
  (the app's and the bookshelf's): comments on a chapter of the verses
  shown first, then on the chapter read, then its book, the panel's
  commentary's first at each; a row says
  `Psalm 23:1 · Matthew Henry’s Concise Commentary` over the words found;
  a tap goes to the verse and opens the commentary in the panel there.
  Dictionaries and Books: an entry or part titled with the first word
  first; a tap opens it. Three a section, then `Show All N`. While
  documents' indexes or other versions are still being read, a faint busy
  row `Searching more documents…` ends the list; each one read makes the
  screen again with what it adds. A search's results are kept for its
  query and where the reader is, so making the screen again (a `model`) is
  quick. The field waits 150 ms after a key
  before it is searched (its screen's search wait). A section's `Show All N`
  pushes a screen of that section alone, every row, as All N Verses pushes
  Search: a documents section's (`SCR_DOCS`, titled as the section), or
  what the words find in a group's documents (`SCR_FOUND`, Commentaries or
  Dictionaries and Books, the words under the title, its header the count:
  `793 matches, the first 500` when more were found than are kept), its
  rows made as they come into sight (a lazy section). Nothing found: the screen's `empty` (No Matches; its
  line "More is found when you’re online." where only the connection
  stands in the way).
- Its documents are rows of one model, wherever they are kept: no icon,
  the title (two lines at most), a small line (`BSB · Modern,
  word-for-word and readable`, `RomCor · Romanian`, in Documents
  `Commentary`), a check on what the page and the panel show (the same
  whichever opened Go To), a ⓘ to the document's page; a tap opens it.
  Nothing on a row says whether it is on the device, how large it is or
  how its download goes, and Go To lists only what can be opened now
  (offline, what is here).
- A document's page (kind 62, a bundled version's 68) is pushed over Go
  To: the title and what it is (`Commentary · English · Version 2.1`, its
  own line), Read (as a pick in that Go To), why it can't be read if it
  can't, About, Details, License, then a page's paragraph of small faint
  words: where it is from and, while it is kept here and no pane shows it,
  `Kept on this iPhone · 5 MB · Remove`, Remove a link in
  `RUN_SMALL_UNDERLINED` (nothing asks first; the page then says
  `Removed.`).
- A document not on the device opens all the same: the pane it lands in
  keeps showing what it shows until the new one can be read, then changes
  to it at the same place (Panes: Arriving). A dictionary or a book not
  here opens its screen in the sheet, which says "Opening…" until it has
  come.
- `tap shelf` opens or closes the panel; with nothing to read there it
  presents Go To aimed at the panel (no `beside` line), and the panel
  opens (`beside 1 0`) only when a document is picked. Without a panel
  that fits, it presents Go To aimed at the page.
## Practice

`core/practice.l8` is Practice apart from any platform: a session's queue
of passages, each passage's steps and level, the words shown, helped and
missed, typing's first letters, the grades, and the end. Every opener (the
Library, a passage's row, the tray's Memorize) is core's `px_start`.

Every skin draws core's screen (`SCR_PRACTICE`): the
passage as a page's paragraph whose runs are each word's look
(`RUN_PRACTICE` plus a look: its color, clear, ink, learned or faint; its
underline, the rule, the accent, half the accent or the accent dotted,
times 4; 32 the verse heard; 64 Greek, 128 Hebrew), a hidden word's tap
showing it and a verse number's its verse; the levels as segments; the
count at the bar's left; the step's buttons; the end as its empty words.
A skin that plays a passage says so (`SK_NUM_PRACTICE_AUDIO`), and one that takes typed
letters (`SK_NUM_PRACTICE_KEYS`); their buttons are left out otherwise.

## Settings

`core/prefs.l8` keeps the settings as integers by name, with the names the
iPhone's defaults already use (`sizeStep`, `theme`, `showVerseNumbers`,
`librarySegment`, `interlinearOrder`, ...). A skin loads and saves them as
text (`name value` lines), or maps them to its platform's store.

## The wire, for skins in another language

Android's skin is Java and the web's is JavaScript; both talk to core
in lines (UTF-8, `\n`-ended; fields split by tabs, a field's tab, newline and
backslash written `\t`, `\n`, `\\`). The iPhone's UIKit renderer decodes these
messages into its own screen storage using `core/wire.l8`. `core/skin.l8` reads the skin's lines
(`sk_line`) and writes its answers into `ui_out`; `tools/skin_text.l8` is
the whole wire on a terminal, for developing core without a phone:

```
printf 'start 400 800 100 0\ntap goto\nact 1 1 42 0\n' | .build/skin-text programs/bible/data /tmp/prefs
```

The utility also accepts development commands: `visit C V TIME`, `plans`, `plan P
D`, `follow P DAY`, `open KIND ARG` (any screen, presented), `compare C V N`,
`study C V K`, `esv C V WORDS` (a result of the ESV's own search), `memorize
C V1 V2` (a passage in Memory, to practise).

A screen, from core:

| Line | Meaning |
|---|---|
| `screen ID KIND ARG GROUP` TITLE SEARCH | a screen built; GROUP 0 is the sheet, 1 the side panel; then the lines below, its `section`, `row` and `cell` lines, then `end` |
| `focus N [MODE]` | the screen opens at its Nth row (of all, from 0), at the top; MODE 1 selected and in the middle, 2 in the middle, 3 at the top and washed (a Manual's part gone to by a link); `focus N 4 FROM TO`: the row's words FROM to TO (UTF-16) are to be kept in sight, which the `reveal` effect asks for (Practice's words practised, the word being typed) |
| `subtitle` TEXT | a line under the title, in the bar: what a reading is of (a commentary's, a book's or a dictionary's title) |
| `intro` TEXT RUNS QUOTE | words above the first section (a plan's description; the language page's); QUOTE 1, a quote (an accent's bar beside it) |
| `left` ACTION TITLE ICON STYLE | a button at the left of the bar, in place of Back (a note's Cancel; Practice's count, inert) |
| `hero` WORD SCRIPT SUB LINE RUNS LARGE | a word as the heading: large in its script (`RUN_GREEK`, `RUN_HEBREW`), its transliteration, a line under them; LARGE 1: larger still, what the screen asks about (an exercise's letter or word) |
| `index` TITLES | an index down the list's side, a title each section (split by `\|`) |
| `confirm` ACTION TITLE OFF | the confirming button at the top, in place of Done (OFF 1: not yet) |
| `tool` ACTION ARG TITLE ICON LABEL STYLE PLACE MENU | a button at the foot: its title, or ICON and the spoken LABEL; STYLE 0 plain, 1 prominent, 2 destructive, 3 off; PLACE 0 left, 1 middle, 2 right; MENU, if any, its items `ARG:TITLE` split by `\|`, each doing ACTION with its ARG |
| `segments` ACTION CHOSEN LABELS TITLE | segments over the list (TITLE 1: in the bar, as its title); choosing one is ACTION with its index as VALUE |
| `filter` ACTION CHOSEN COLORS LABELS | a filter by color: All, then a circle each (hex, spoken labels); choosing is ACTION with its index (-1 All) |
| `sort` ACTION CHOSEN TITLES | how its rows are sorted, a menu; choosing is ACTION with its index |
| `field` TEXT WAIT FLAGS | its field's words, how long typing rests before they are sent (ms), `g` Return goes (Go To), `f` it takes the keys as the screen opens |
| `scopes` VALUE TITLES LABELS | the field's scopes, the one chosen |
| `plain` | a plain list, not grouped |
| `page`, `grid` | its rows a page's paragraphs; its rows square buttons, their VALUE their words |
| `reader LINKED` | the screen is the panel's reader (pane 1, below: the version or commentary read beside the page) in place of rows; LINKED 1 while it is linked with the page |
| `empty` SYMBOL TITLE LINE | what it shows with no rows |
| `button` TITLE, then `command` ACTION ARG TITLE FLAGS | its button at the top and its menu (`x`: destructive) |
| `section` HEADER FOOTER BUTTON ACTION SUFFIX CREDIT COLUMNS | a section: a button in its header doing ACTION; faint words after its header; CREDIT the credit under it (0 none; each said at `start` by a `credit` line); COLUMNS a grid's columns' names |
| `row` ... | a row (below) |
| `cell` ACTION ARG SCRIPT TEXT SUB COUNT LABEL TR FLAGS ACTIONS | after its row, a grid's cell or a tile: its words in a script (0 none: a faint "—"), what it does, its count, what a screen reader says, and its tap (ACTION 0: none); a tile's transliteration and its flags (`UI_TILE_`: what it hides; the one being chosen for, ringed; an answer wrong, in red over what was chosen, struck through; a choice offered, its words alone as a button), and the actions a screen reader offers |

A row's fields, in order: `row` KIND ACTION ARG TITLE DETAIL ICON ACC FLAGS
VALUE OPTIONS LO HI LABEL TRAILING DELETE CUSTOM HINT MARKS LINES CIRCLE
CIRCLE_ACTION SUFFIX ICON_COLOR NOTE INFO ACTIONS RUNS TRUNS TITLE_LINES
FIELD_KIND LEAD LEAD_STYLE SIDE SRUNS SIDE_NOTE ACTION_ICONS LINKS CAPS.

- KIND is `item`, `toggle`, `choice`, `slider`, `field`, `button`, `custom`,
  `time`, `text` or `tiles`; ACC is empty, `more`, `check`, `info`, `done` (a faint check) or
  `link` (a page outside the app).
- FLAGS are letters: `d` disabled, `x` destructive, `o` on, `v` the detail is
  a value on the right, `s` the detail is the Bible's words (the divine name
  in small capitals), `f` faint, `b` strong (the row to go to: heavier, its
  words up to two lines), `t` its title in the accent, `g` its icon faint, `m`
  its detail smaller, `k` its circle dimmed and inert, `a` its trailing words
  in the accent, `r` a field whose Return is the screen's confirm, `e` a field that keeps
  the keyboard up after its Return and takes it again at `retext`, `q` the
  words its screen's field searches for marked in it, `w` waiting (a
  spinner), `l` a field whose words go to core as they are typed, `u` its
  actions also a menu at its end, `h` a page's heading.
- VALUE is a toggle's or choice's state, a slider's value (from LO to HI), a
  time's minutes, swatches' chosen color; OPTIONS a choice's labels split by
  `|`; LABEL what a screen reader says, if not its words; TRAILING words at
  its end (a time, a count); DELETE the action its swipe does (0: none);
  CUSTOM its own presentation where a skin has one (core/skin.l8's
  `CUSTOM_`: Listen, the text size, themes, font samples, a verse found, the
  ribbons' swatches, a download, a mark, a passage, verses); HINT what a
  screen reader adds.
- MARKS are places in the detail to stress (pairs of UTF-16 offsets split by
  spaces); LINES the most lines of its detail; CIRCLE a circle at its start
  (0 none; 1 empty, 2 half, 3 full) doing CIRCLE_ACTION; SUFFIX faint words
  after its title; ICON_COLOR its icon's color (hex); NOTE a small faint line
  under its detail; INFO the action of its ⓘ; ACTIONS what a screen reader
  offers (`ACTION:TITLE` split by `|`, each with the row's ARG; the one that
  is DELETE destructive), and ACTION_ICONS their icons; RUNS, TRUNS and SRUNS
  its detail's, title's and side words' runs; TITLE_LINES the most lines of
  its title; FIELD_KIND what a field takes (0 a name, 1 a reference, 2 prose:
  a note's many lines, 3 letters as typed: no capitals or corrections, a
  word written in English letters); LEAD a glyph at its start in LEAD_STYLE's script;
  SIDE words at its end over SIDE_NOTE; LINKS a paragraph's links
  (`B:E:ACTION:ARG` split by `|`, B and E UTF-16 places in its title);
  CAPS, in a scripture row's detail, the divine name's letters to set in
  small capitals (LORD's ORD: pairs of UTF-16 places, as MARKS). In runs,
  the Bible's words (`RUN_SCRIPTURE`) have the same letters as runs of
  their own, `RUN_DIVINE`. A commentary's paragraph that opens with bold
  words ("Verse 12.") has them as a run of `STYLE_LABEL`: a small sans
  label run into the paragraph, faint, with room above the paragraph, so
  that each comment's start is found without reading.

Other lines from core:

| Line | Meaning |
|---|---|
| `present ID`, `push ID`, `update ID`, `pop`, `pop_to ID`, `dismiss` | what to do with screens |
| `refill ID FADE` | screen ID made again as its field is typed in (FADE 1: a cross-fade) |
| `retext ID`, `blur ID` | the fields to show the screen's words again (its search field's, and a `field` row's detail, though it is being typed in); the keyboard put away |
| `reader N` | the Bible has N chapters (each pane's) |
| `part P C K N` TEXT | part K of chapter C of pane P's document, the chapter in N parts (0: not known yet, a commentary still opening), and the panes' other lines: see Panes above |
| `go P C I FRAC MODE`, `halt P`, `forget P C`, `line P THOUSANDTHS`, `link C MODE` | a pane to a place, its glide stopped, its parts to be asked for again, its reading line; a chapter's link map: see Panes above |
| `arriving P THOUSANDTHS`, `arrived P` | a document on its way to pane P, so much come (a hairline along the foot of that pane's bar, ink at 30%); nothing on its way any more (the hairline fades out): see Panes, Arriving |
| `goto` | the sheets away, as the platform puts them away (a `go 0` follows) |
| `highlights SWATCH WASH STRENGTH...`, `themes DAY NIGHT PAGE INK...`, then `look SIZE SPACING MARGIN DARK RED BG INK HEADING FAINT ACCENT RULE GLOSS FONT THEME CHOSEN HAIRLINE SELECTION SHEET CELL` | all a skin needs of look.l8. `highlights`: each of the five by the color its `mark` lines name it with, and the wash a highlighted verse shows now (STRENGTH, like GLOSS, HAIRLINE and SELECTION, in thousandths). `themes`: the themes Auto follows by day and at night, then each theme's page and ink, in the Theme setting's order (for its swatches). `look`: FONT the one chosen of the skin's own (`sk_fonts`, named in its settings' Font section, each row `CUSTOM_FONT` with the font's index as its argument); THEME the theme it is and CHOSEN the one chosen (0 Auto), of `themes`; HAIRLINE a rule's strength (RULE's color), SELECTION a selection's (ACCENT's); SHEET and CELL a sheet's color and its rows' (`-`: the platform's grouped colors) |
| `title` TEXT, `version` TEXT | the bar's title (the chapter) and the name of what the page reads (the version's, Berean Standard Bible; the commentary's short title; while a document is on its way to the page, its name), shown small and faint under the title (which opens Go To); a collapsed bar shows the title alone; the version is chosen in Go To, not from the bar or the settings |
| `url` ADDRESS | a page outside the app to open |
| `back` WORDS | the capsule's words (none: away); the way back and a ribbon move the page with `go 0` |
| `next` | core has work going on a step at a time (the Bookshelf opening a module, making a Bible a version, decoding a commentary's block): the skin answers `next` on its next turn, once it has drawn and taken input, so the app answers its reader between steps however slow it runs |
| `awake MS` | Keep Screen On: the screen kept on MS more (after a `rest`, a tap), or let go now (0: a sheet opened, the setting off). A skin offers the setting with `sk_has_keep_on` |
| `settings` | a setting changed that doesn't lay the text out again |

The host's effects (what only a platform can do; a skin without one ignores
it): `ribbon_color ID`, `chosen OWNER`, `marked SLOT DAY`, `plan_stopped`,
`remind WHO ON` (a reminder's switch: WHO 0 Memory's, else a plan's slot
plus 1), `remind_time MINUTES`, `open_settings`, `searched`, `audio_source`,
`voice`, `cellular`, `download`, `download_delete`, `practice_audio ACTION
ARG` (Speak on core's Practice), `felt KIND` (something to feel: 0 a grade
given, 1 a wrong letter typed), `announce` WORDS (for a screen reader alone:
a word missed), `toast SYMBOL ICON` WORDS (a toast's words, and its
symbol: 0 plus, 1 a check, 2 the brain, 3 the carried ribbon; ICON the
symbol's name, `-` for the ribbon's glyph in the carried ribbon's color), `study_verse C V`,
`study_moved C V` (Study in the panel moved to another verse: the reader
follows), `beside OPEN FULL` (whether the panel beside the reader is wanted
open: at `start` as it was left, then as core opens or closes it: `tap
shelf`, its key, the tray's Study, a document picked in Go To aimed at
the panel, its close; and whether it fills the screen, the reader hidden
under it: `tap full`, or beside the reader again, as a reference tapped
in it puts it. A skin opening it asks for its screens, `panelmake`, which
come as `panel ID` (its first: the reader of what it reads beside the
page, at its place, or Study) and `push ID` (Study at its verse, over the
reader), each of group 1; with nothing to show, core answers `beside 0
0`, and the skin closes it, asking again the next time it opens; it lets
them go with `closegroup 1`), `command K MENU NAME MODS` TITLE (each of
the keyboard's commands, at `start` and again as its title changes: its
menu, 0 Go, 1 View, 2 none; its key and modifiers, as `key` sends them;
Show Panel or Hide Panel), `commands MASK` (those that act now, bit K, written as that
changes), `credit K` WORDS LINK ADDRESS LABEL (at `start`: a section's
credit K, its words then a link to ADDRESS, and what a screen reader
says of it), `editcommand K` TITLE (at `start`: the text's own menu's
commands, done as `editmenu K`), `accessory NAME` WORDS (at `start`: what
a screen reader says of a row's accessory, `done`'s), `trayfit` TITLES (at
`start`: the tray's buttons' titles, split by `|`, that a skin sizing one
size of title for all of them fits to the widest), `studyable 1|0` (the answer to `studyable`), `copy`,
`share`, `share_image` (Share as Image's card, above), `highlighted`,
`bookmarked`, `clear_selection`, `tray`, `tray_away`.

From the skin:

| Line | Meaning |
|---|---|
| `start W H DENSITY DARK TZ` | the app begun: the window (points), its scale (hundredths), the system's appearance, its time zone (seconds east of UTC: the day turns at its midnight) |
| `tap goto`, `tap settings`, `tap history`, `tap search`, `tap library`, `tap shelf` | the bar's buttons (`goto`: its title, which finds words too, so a bar needs no Search button; `search` stays for a skin's keys and menus; `shelf`: the panel beside the reader opened or closed, or with nothing read there yet Go To aimed at it; without a panel that fits, Go To aimed at the page) |
| `act ID ACTION ARG VALUE` | an action (VALUE: a toggle's 1 or 0, a choice's, segment's, filter's or sort's index, a slider's value, a time's minutes, a swatch's color). An action on a screen means those over it have gone |
| `query ID TEXT` | screen ID's field typed in (TEXT to the line's end), once typing has rested |
| `scope ID N` | scope N chosen in screen ID's field |
| `text ID ACTION ARG TEXT` | a `field` row's words: its action with them |
| `submit ID` | Return (Go) in screen ID's field |
| `closed ID` | the skin closed screen ID (and those over it) |
| `open KIND ARG PUSH`, `panel KIND ARG` | open a core screen from a platform entry point; PUSH 1 pushes it, 0 presents it; `panel` opens it beside the reader |
| `openplan PLAN DAY SELECT PUSH` | open a plan's days at DAY, with that day selected when SELECT is 1 |
| `anchor ID` | keep the navigation stack through ID, closing screens above it before pushing from that controller |
| `tap full` | the panel's button: it fills the screen, or is beside the reader again |
| `panelmake` | the panel beside the reader opening: core makes its screens (`panel`, then a `push` of Study, group 1) as it was left, or says `beside 0 0` when there is nothing to show |
| `panelanchor ID` | the panel's Back (or a swipe) shows ID on top: core lets the panel's screens above it go, any sheet's kept |
| `closegroup GROUP` | close the sheet's screens (0) or the side panel's screens (1) |
| `panelfits 0/1`, `panelvisible 0/1` | tell core whether the skin has a panel beside the reader (at its right or under it), and whether it is currently visible, including when the platform temporarily detaches it |
| `panelfill 0/1` | tell core whether the panel may fill the screen now: 0 where it is a column beside the page (UIKit's inspector column on a wide window), and core's reader menu has no Full Screen then; a skin that never says keeps Full Screen |
| `model ID [SECTION ROW]` | return the screen's current description without a presentation effect; with windowed rows, include the requested lazy row |
| `windowrows 0/1` | choose full lazy sections (the default) or their counts with rows fetched on demand, a page at a time (`model ID SECTION ROW`); available to every skin |
| `editmenu COMMAND` | perform one of core's text-selection menu commands on the current selection |
| `place C V FRAC` | the page's place as an address names it: where it opens, before `start`; Go To it, after |
| `want P C K`, `at P C I FRAC [NAMED]`, `rest P ENDS_HI MS`, `moving P MS` | a pane's part wanted, its reading line's place, at rest, a finger on it: see Panes above |
| `dark 0/1` | the system's appearance changed |
| `esvstatus STATUS ESV`, `esvact WHAT C` | whether the site's Worker gives the ESV (STATUS its answer's, 0 none); a tap on chapter C's ESV line (`link` KIND 3: ARG `ESV_TRY`, `ESV_BSB`, `ESV_SITE`). Core asks for the ESV's chapters near the place as a wire skin reads it (its host's `fetch`), draws one not here as its line, and ends each with "(ESV) · esv.org" |
| `version ABBR` | the version an address names (`KJV`): before `start`, the one the reader opens in; after, read now |
| `away` | the app put away: the settings kept now |
| `word W` | a word of the original tapped (a `link` of KIND 2, its ARG the word): core's word screen (`SCR_WORD`: its form, where, transliteration, gloss, meaning, parsing; Word Study) |
| `tapverse C V`, `tapnone` | a verse tapped (core toggles it: another chapter's starts again), or the reader elsewhere (the selection let go); core says `selection` C V... (C -1: none) for the skin to paint, and writes the tray's model as screen 0 (`tray`, `tray_away`). A skin hit-tests in this order: a footnote's mark, a word of the original, a reference, a note's mark, the ESV's line, a chapter's note, then a verse (within a few points), else elsewhere |
| `select C V...` | the verses selected, whole (none: the tray away), for a skin that keeps its own selection |
| `trayact ACTION V`, `titlemenu`, `menuact ACTION ARG` | a tray's button; the title's menu's model, as screen 0; one of its items |
| `versestudy C V` | verse C:V's Study, as core's screen (a skin's answer to `study_verse`) |
| `spoke C V MS`, `spoken C V`, `listenstop` | the skin's voice began (MS its clock: following waits 8 s after a finger moves the reader) and finished saying verse C:V (0 the chapter's title), or was stopped: a skin speaks what core's session gives it (`say C V` WORDS, `player` TITLE STATE PLAYING READER VERSION (also for the platform's own player: a lock screen's, a headset's; its buttons `listenplay`, `listenpause`, `listenprev`, `listennext`, `listenstop`), `follow C V`, `listen_stop`) |
| `next` | the turn core asked for with `next`: a step of its work |
| `tick MS`, `jumped KIND` | the time core asked for (`wake MS`), a jump (0 with a way back, 1 the capsule's, 2 neither): `core/reading.l8` counts chapters read (20 s at the page's `rest`, end seen), moves the carried ribbon, and puts a chapter dwelt in 20 s onto the history |
| `back` | the capsule tapped: core goes back (`go 0`), or opens the plan's day it came from |
| `key NAME MODS` | a hardware keyboard's key (NAME its character, or `left`, `up`, `down`, `space`, `return`; MODS 1 ⌘ or Ctrl, 2 Shift, 4 Alt): `core/keys.l8` makes it a command and does it where it acts — Go To, Search, Library, Settings, chapters, Back, Listen, a page (`page 1` down, `page 0` up: the skin scrolls a screen less three lines), a plan's day's Mark Read and Next, Practice's Check and grades, the panel beside the reader and Study's verses in it. A skin with menus or a command overlay makes them from core's `command` lines and offers each where `commands` says |
| `footnote C P`, `preview REF` | a footnote's mark tapped (its place P in chapter C), a reference tapped: core's footnote (`core/footnote.l8`) or preview |
| `studyable C K A B`, `studyat C K A B` | whether the words at UTF-16 A to B of part K of chapter C's text on the page have a word to study (core says `studyable 1` or `0`: a skin's menu offers Study), and that word's Study opened |
| `link ADDRESS` | a link into the app opened (`bsb://JHN/3/16`): the reader there |
| `refresh` | what core's screens show has changed (the host's own state): each made again |

A host in L8 (android/main.l8) reads files and keeps the settings for core
(`sk_host`: `save_prefs`, `save_kept` for what is kept, `words` and `num`
for what only it knows, `fill` for its lists, `fetch` for the requests it
makes (`SK_FETCH_ESV`: the ESV's chapters, asked for by
`core/esv_client.l8`'s rules, one at a time); `SK_NUM_MEMORY_TEXT`, a
passage's words laid out, defaults to core's own from a loaded version),
and handles lines of its own
before core's (Android's `files DIR`). A version core wants that isn't
loaded is asked for in `sk_want_text`: the host loads it in its own loop (a
text is kept for good, so loading it can't happen inside an action) and
calls `sk_use_version` again.

## The iPhone as a skin

`ios/skin.l8` draws core's screens in the app's own lists: twelve slots in
the table registry (`ios/tables.l8`). `ios/wire.l8` sends encoded commands
to the protocol dispatcher, decodes screens into independently owned storage,
and consumes presentation effects from the returned lines. A row's
action is `act ID ACTION ARG VALUE`; its effects are done the iPhone's way
(`push` into the navigation the action came from, `present` as a sheet,
`update` a cross-fade and reload, a row deleted with the system's animation
when that is all that changed, `dismiss`). The platform's work stays the
app's: core's version switch is the iPhone's `switch_version`. Core's screens
are the app's own controller class (`L8CoreList`), made again as they come
back from a screen pushed over them; Go To's and Search's are the app's own
classes for their focus and keyboard.

For a lazy section (Search's verses, Show All's finds, the concordance), the
iPhone sends `windowrows 1` before `start`. After the section's header,
core sends `lazy COUNT FIRST N`: COUNT is its logical row count; FIRST is
-1 (and N 0) when no row was requested, otherwise the first of the page of
N rows (32, fewer at the end) holding the requested row, whose ordinary
`row` and `cell` lines follow. `model ID SECTION ROW` returns a fresh screen
with that row's page included, and the iPhone reads rows from it until one
outside it is wanted: a list scrolled makes its screen again once a page,
and a search of a thousand verses sends only those in sight. Skins that
use the default full sections continue receiving every row.

On an iPhone with iOS 26, where a screen's search field floats at the
list's foot, its `scopes` are its title, a segmented control (a choice is
`scope ID N`, as ever): the search bar's own scope bar belongs to the
navigation bar there, and on a pushed screen comes only once the push has
ended and stays over the screen below as it is popped. Elsewhere they are
the search bar's scope bar.

The iPhone keeps each screen's latest bytes as core sent them (with a
command's effects, or as a `model`'s answer) and the count of lines core
had been given then. A list reloaded with no line given since (UIKit asks
several times in one reload, and two lists in sight ask by turns) is read
from those bytes; only after core has been given another line does it
send `model` again. On the phone's interpreter a screen made again costs
tens of milliseconds, a search's more.

Core drains complete lines through the host's output receiver as its buffer
fills. A large screen can span multiple batches; a batch boundary does not
end a screen. Hosts must consume or copy each batch before returning. A
single line that cannot fit, or a full buffer without a receiver, fails
explicitly instead of reporting truncated output as a complete screen.

Every list is core's (2026-10-22): Go To (its ribbons and plans too),
Search (the ESV's results too: the iPhone asks its server, core keeps and
shows them), History, the reading settings, Glosses, Voice and the
voices, Downloads, the Manual's list, Acknowledgements and Changes, Reading
Plans, a plan's days and its Daily Reminder, A Chapter a Day, Begin At, New
Ribbon and a ribbon's screen, a document's page, the Library and Memory (Add Passage, a
passage, its versions, Memory's reminder), Compare, a word's study, its
grammar and concordance, the language page and what it pushes (Sounds
Written As, the Alphabet, Your Words, Add Words and its preview, Verses You
Can Read) and a lemma's Forms. What is kept (the settings among it) is
core's, in the files its host keeps through the iPhone (`KeptStore`), as
for every skin; a change of the look comes as the look's lines, Keep
Screen On as `awake`. The iPhone's menus and keyboard commands are core's
(`command`, `commands`), and so is what the panel beside the reader
shows (`beside`): the iPhone draws them, and the panel beside the page
(below).

Both panes are `ios/pane.l8`'s window, one each: the page's table and the
panel's reader screen's, each a table with no rows whose header holds its
parts' `UITextView`s one after another, each measured whole as it comes
in (TextKit 2), so that where anything shown is is known. Parts come in a
screen and a half ahead while a pane moves and three at rest, those far
behind go, and one coming in or going above what is in sight moves the
table's offset by its height at once. A pane finds its places from its
parts' anchors' lines, and tells core as its anchor changes and at rest.
A `go` waits for its pane's table to be on the screen, and is carried to
a new table as what the panel reads changes. Linked, the pane a finger
last moved leads and the other follows each frame by core/follow.l8's
rules (a commentary waiting while the page decelerates).

From iOS 26 the panel is UIKit's (`ios/inspector.l8`): the window's root
holds a `UISplitViewController` (two columns), the page's navigation
controller moved between two hosts of the app's (the secondary column's,
expanded; the compact column's, collapsed), so that UIKit never wraps it
and the page never has a Back; the panel's navigation controller is the
split's inspector column. On a wide window the panel is a column at the
page's right (320 to 390 points, at most 480 or 0.4 of the window, its
divider dragged; the page keeps 28 em and its margins, `panelfill 0`: no
Full Screen there). Collapsed (an iPhone, held either way: sideways its
split lays the inspector over the page, not beside it; and an iPad window
too narrow for both, the room inside its safe area; the root tells the
split its size class) UIKit shows
it as a sheet over the page, `panelfill 1`: at a third, a half or the
whole height (the last its Full Screen, `tap full` sent as the sheet
reaches or leaves it), the page bright and usable above the first two,
the system's grabber and its swipe away (`tap shelf`). The sheet's
heights and the page undimmed are set before each showing (UIKit makes a
new presentation each time); it opens at the height it was last left at.
UIKit calls nothing as the sheet moves, so a display link watches it from
the move's start to three still frames: each frame the tray, the way
back's capsule and the mini player ride above its top; once still, the
page's bottom inset becomes what the sheet covers (its offset untouched,
so nothing on it moves), its place is told, and the panel is brought by
the rule once if the page's top edge's link is out of its sight (at the
whole height the page is left as it was). The panel's reader is laid out
at its place out of the window before the sheet is asked for, at the
size the sheet last had at that height, with the window's display scale,
text size and style lent to it (TextKit measures by them), and corrected
in its `viewIsAppearing:` at its final size, before the sheet's first
frame.
Sheets (Go To, Reading) present over the panel's sheet, never in place
of it. The reader has the system's navigation bar: its title the page's
title's kind (the chapter with its chevron, what is read small and faint
under it, a tap Go To aimed at the panel), Link at its left in the
accent while linked, the menu at its right, plain glyphs, the same items
moved to each new reader screen (Swap Panes) and changed in place; the
bar opaque in the panel's color with a short fade below it, as the page's
bar is, so that nothing is legible behind its title; its words at 0.9 of
the page's size at every height. At a third and a half the sheet floats
a little in from the screen's edges: a cover in the page's color, placed
each frame with the sheet, keeps the page's words out of that gap. Its other screens (Study) have
the system's bar with Back and their buttons in the panel's toolbar, as
in Study's own sheet; on the sheet no screen has a close of its own (the
swipe, the page's panel button and Close Panel put it away), in a column
each has one.

Before iOS 26 the panel is the app's own, laid out by frames
(`ios/beside.l8`): at the page's right on a wide window, under it on an
iPhone, its grabber resizing it. The panel opened (or its grabber
dragged) makes the page shorter under a place core sent the panel to:
once the panel's reader is laid out, the page's place is told again and
the panel brought to it by the same rules. Its reader has no navigation
bar: a row of its
own, 48 points, the grabber over its top, core's `left` as the
document's name, then "· " and the chapter faint after it while core's
title names one (the chapter at most half the row, cut at its end), then
a small chevron, all one button; Link (the accent while linked, else
faint) and the menu as glyphs; its words a short fade under it, and at 0.9 of the
page's size (the page's look made again at that size, `look_swap`). Its
other screens keep the system's bar under the same grabber. The page's
last 24 points over the panel fade into the page's color, as its top
bar's do, over one hairline. A sheet's Done is a check on the bar's plain
glass, not the system's filled Done; a row's ⓘ is faint, a check in the
accent; a field floating at a list's foot is marked an element of its
bottom edge (`UIScrollEdgeElementContainerInteraction`), so the rows
soften under it.

## Moving the iPhone

One screen at a time, keeping its look: its rows come from core, drawn by a
generic UIKit renderer plugged into the table registry (`ios/tables.l8`); its
actions go to core. Each move is checked in a TestFlight build before the
next, because the UI can't run on the development machine. What the screen
model lacked was added to it for every skin (a row's glyph and side words, a
grid's cells, a tool's menu, a time row), not as a custom cell.

## Android, the first skin

Built as Better's is (`tools/android/`, no Gradle): L8 as a shared library on
its own thread, Java's framework widgets (no AndroidX), data files from the
APK's assets copied to the app's files. It draws the whole screen model
(2026-10-22: checked on the emulator with Go To, the Library, Memory, the
Greek page, the Alphabet, the reading settings, the chapter grid, and
Practice: Add Passage, then a passage's levels, a word shown, Check). A
row's field keeps the keys while its screen is made again, and the screen
waits for typing to rest before it is. What is kept (highlights,
bookmarks, notes, history, ribbons, Memory) is core's files, as the
iPhone names them. A tap on a verse selects it (core's tray: highlights,
Copy, Share, Bookmark, Note, Compare, Memorize), and highlights show as
core marks them. The language data, cross references, commentary and
Manual are in the APK (about 37 MB) and read at the start, so Study (the
tray's: `versestudy`), word studies, the Manual's pages and the Greek
lessons work, and the lessons finished are kept. Reading Plans work there from core: following a plan
(its file plan-N.tsv, their numbers in plans.txt; `SK_KEPT_PLANS`), its
days, core's day's reader (`SCR_DAY`: its passages, Mark Read, the day's
end), Day Done.

Its two panes are one reader made twice (`Reader.java`, pane 0 the page,
pane 1 the panel's reader): the platform's list (a `ListView`) of
`TextView`s, one a part, so that the fling, TalkBack's reading and
scrolling, and the text's selection and its menu (Copy, Share, Select
All) are Android's. Each holds a window of parts, asked for (`want`) two
and a half screens ahead and a screen and a half behind and let go three
and four away, each measured as it comes in by a `TextView` set up as the
list's are (selectable too: a selectable one lays its words out as an
editable one does), so that where every anchor in the window begins is
known to the pixel, in sight or not; a part the list lays out taller or
shorter than it was measured is measured again. A part coming in above,
or one sent again, never moves what is at the reading line: the list is
put back where it was with `setSelectionFromTop`, given as the list lays
itself out (its padding, which that counts from, is only then up to
date); a layout of the list's own (a selection brought back as a key
leaves touch mode) is undone the same way, and keys are core's (`key`),
not the list's. It says `at` as the anchor at its reading line changes and
at rest, `moving` as a finger starts to drag it (or catches it moving, or
TalkBack scrolls it), and `rest` as it stops. `go` 0 puts it there at
once; `go` 1 glides 0.3 s from within a screen and a half, at once from
farther or where the system's animations are off; where it goes is held
as parts come in about it, until a hand moves it. A line of core's moving
a pane a finger is on is let go, and `halt` stops a glide or a fling but
not one that following chose.

Linked, `Linking.java` places the follower on each frame the leader (the
pane a finger, a fling or a key last moved) moves, by core's rules ported
to `Follow.java` and checked against `link_cases` (`make
bible-follow-test`, with a JDK: `android/follow_test.sh`): a version a
pixel at a time (`scrollListBy`), brought to the leader's verse at once
where it hasn't the leader's chapter; a commentary at a comment's border,
gliding, waiting while the page is flung. A commentary's run of chapters
without comments needs no map: it is the commentary's place wherever the
page is in them, and leading from it, the page stays in them or goes to
the run's nearest chapter (the one it came into the run from, not the
run's first). A chapter's first part has room above it and its last
below; a part that only holds a place (a commentary's coming, a run
without comments, the ESV's waiting line) is as tall as the pane. The
page's taps are core's (`footnote`, `word`, `esvact`, `preview`,
`tapverse`, `tapnone`, each with its part's chapter), a tap that lets the
text's own selection go doing only that; the selection, the verse heard
and highlights are washed on its parts; the panel's reader previews a
reference tapped.

The panel beside the page is a second stack of core's screens (group 1),
said to fit always (`panelfits 1`): at the page's right, 390 dp wide after
a rule, where the page keeps a column of 24 em beside it (a tablet, a
phone on its side), else under the page (half the window, a strip's
grabber dragged to resize it, down to close it or up to fill the screen);
filling the screen (`beside 1 1`, its button), the page hidden under it.
It asks for its screens as core opens it (`panelmake`), says whether it
shows (`panelvisible`), and its Back says `panelanchor`, or on its first
screen closes it (`tap shelf`); the system's Back closes a sheet, then
puts a full panel beside the page, then goes back in the panel. A screen
that says `reader` shows pane 1 in place of its rows, under its title and
subtitle, with its tools (Link, the menu) at its foot. Checked on the emulator
(2026-11-04, the panes as lists): the page dragged and flung, Go To and
the way back, a key's page; the KJV beside the page under it following
verse by verse with either leading, dragged and flung both ways (each
frame's follower within half a pixel of the rules, never moving against
its leader), unlinked and linked again; Burkitt's from the Bookshelf
following comment by comment and leading the page, waiting through the
page's fling, its run of chapters without comments both ways; the panel
filling the screen and back; the panel at the right on a phone on its
side, each pane's place kept through the turn; the text selected in both
panes; TalkBack's focus on a part, each part a node with its words.

Since 2026-10-22 its host is core's (`core/host.l8`), as the web's is: its
L8 (`android/main.l8`) is only the platform's primitives, read from the
app's files (a version asked as `bsb.folio` is that folio), the kept files there,
and a GET made by the Java side (`http_get ID URL` to it; it writes the
body to the files' `http/ID` and says `http ID STATUS SIZE`); it sends
`api https://smoothbible.com/api/v1/` and waits for `ready` before
`start`. The Java side meets the contract with Android's own parts: the
ESV through the site's Worker, recordings (`MediaPlayer`), the device's
voices (`TextToSpeech`: rate, a voice chosen, paused and resumed), a media
session and its notification, reminders (alarms, exact where the person
allows, else within ten minutes; notifications; one opened says
`reminded`), Share as Image (the card drawn on a `Canvas`, shared through
the app's own `Shared` provider), a file saved where the person chooses,
typed letters for Practice (the keyboard up while a screen has `keys`),
the reader's fonts (Serif, Sans Serif, Monospace), the verse heard washed,
and the carried ribbon before the title. Checked on the emulator
(2026-10-22): the ESV read, searched and compared; recordings and the
phone's voice; a reminder at its time, opened; a card shared; Practice
typed; a file saved. What L8 writes to standard error goes to the log
(glue.c).

## The terminal

`tui/` is the app in a terminal, the third new skin, and the one in L8: one
native program (`make bible-tui`, `.build/smooth-bible [VERSION]`) holding
core, core's host and the skin. The platform (`tui/main.l8`) gives the host
the data files, the kept files (`~/.local/share/smooth-bible`, the iPhone's
names), a GET (curl, its answer a file) and the lines to the skin, which
reads them exactly as the web's and Android's do: nothing of core's is
called but through the wire. Its own parts:

- The reader (`tui/reader.l8`), made twice (Panes, above): a `ReaderPane`
  for the page and one for the panel's reader, each a window of the parts
  near what it shows (48 at most: those a screen above it and two below
  asked for as it is drawn, those used longest ago let go). Each part is
  laid out for the pane's column (its width core's margins; Relaxed
  spacing a line between paragraphs), poetry indented, a chapter's number
  centered, verse numbers and footnote marks raised; on the page,
  highlights, the selection, the verse heard and the keys' cursor washed,
  in the theme's 24-bit colors. Its unit is a line, and an anchor begins
  on the line its verse number is on. A pane's place is its reading line
  (the page's a third of the way down, the panel's at its top); a part
  coming above it doesn't move it, and at the document's start the rows
  above its first line are blank. A key or the wheel moves a pane a line
  or a page (`moving`). Each pane says its place (`at`) as the anchor at
  its reading line changes, when it arrives where it was sent, and at
  rest; of anchors beginning on the same line, the one it was sent to
  (Go To's verse), else the last. Core's `go` moves it at once, whatever
  its mode (a terminal has no glide; `halt` has nothing to stop), when
  the part is here and laid out; a part still to be read (`coming`) or an
  ESV chapter still to come is shown until it is. 250 ms after a pane
  last moved it is at rest (`rest`), whether a key, the wheel, core or
  the other pane moved it. A pane out of sight (the page under the panel
  filling the screen) still goes where it is sent and follows. In the
  panel's reader a reference or a word of the original opens as on the
  page; a footnote and the ESV's line are the page's alone (core reads
  them in the page's version).
- Following (Panes: Linked), in the reader: linked (the panel's top
  screen a reader whose `reader` line says 1), the pane a key or the
  mouse last moved leads, and on each of its moves, before the panes are
  drawn, the other is placed by `core/follow.l8`'s rules, called with
  both panes' chapter as laid out in rows from each one's reading line
  (an anchor's start, the chapter's top and end, known where its part is
  in the window; a row each one's em). By verse (`link C 0`), the
  follower moves the rows `follow_by_verse` says; past what both have laid
  out, to the anchor matched with the leader's, as far through it. By
  comment (`link C 1`), `follow_comment_from_page` or
  `follow_page_from_comment` says whether it stays or goes to an anchor;
  a terminal has no glide to wait for. A chapter's map is kept from its
  `link` until a `forget P -1` (core sends each once until then); while
  the leader's chapter's is still to come, the following waits for it.
  Moved by core (Go To, a reference in the panel, relinking) or by
  following, a pane doesn't become the leader: after a reference in the
  panel moves the page, the panel stays where it is, and moving it brings
  the page back beside it, until a key moves the page.
- Core's screens (`tui/panel.l8`): a sheet's beside the reader (110 columns
  and wider) or over it; the panel beside the page at its right (110
  columns and wider) or under it, the rows split, so that it always fits
  (`panelfits 1`), or filling the screen (`f`). The panel's reader (a
  screen with a `reader` line) is the reader's pane 1, drawn in place of
  rows under the screen's title, its tools (Link, the menu) at its foot. Each
  screen's lines are kept as they came and read when shown; what can be
  done is a ring of focus items (rows, a grid's squares, a page's links,
  tiles, swatches, segments, sort, filter, scopes, the bar's buttons, those
  at the foot) the arrows move through; Return acts, ←/→ change a setting
  or open a row's menu (its ⓘ, actions, Delete), typing goes to the
  screen's field (or a field row: a note's Return a new line), Esc is Back
  (`closed ID`), a click acts at once. The keys go to the page or to the
  panel beside it, `o` (or a click) giving them to the other: in the
  panel's reader the arrows, j and k move it a line, Space and b a page,
  Tab and Return its buttons.
- The tray, the title's menu (a popup), toasts, Listen's player and the
  way back in the line below, a help (`?`).
- Recordings through ffplay (its position read from its errors' file,
  paused with SIGSTOP), the voice through spd-say (its English voices told
  as `voices`), the clipboard through OSC 52 (and wl-copy or xclip), a
  saved file in Downloads, reminders shown while it is open (a toast, the
  terminal's own notification, its bell; R opens one).

What it turns off in core: Share as Image (`sk_has_card`), Keep Screen On,
the text size (`sk_has_text_size`: a terminal's text is its own).

## The web skin

Core runs in WebAssembly (`web/main.l8`, built with `l8 wasm --async
bw_wait`): its host's loop waits on the page (`bw_wait`) as Android's
waits for its Java side, so what core keeps is made outside any callback.
The host asks the page for the data files by id (`bw_ask`: the site's
`data/HASH/NAME`, a folio as it is and any other file gzipped as
`NAME.gz`, each the page's fetch, given back as `got ID SIZE`),
reads the reader's version and the plans first, then what is kept, and
says `ready`; the language data comes after, and Study appears once it
has. What is kept is `core/kept.l8`'s files, a key each in the
browser's storage (`sb.NAME`); the Bookshelf's downloads and the files it
keeps (`bw_fetch`, `bw_keep`) are in Cache Storage (`sb-held`, as
`/read/held/NAME`), read back whole or a span at a time by slicing their
blobs (`bw_read_kept`, `bw_read_kept_range`).

The skin is JavaScript (`web/page/skin.js`), drawing core's wire the web's
way rather than the iPhone's: the page is the window itself, and both
panes are one reader (`makeReader`) made twice, the panel's scrolled in
the panel's list while core's `reader` screen shows: each a window of
parts, a `section` each in the document's flow, put in as either end comes
within two screens and let go six screens away (one above the reading line
put in or let go without moving what is read, where the browser's own
scroll anchoring hasn't kept it already). A pane finds its places from
where its anchors' spans are laid out, and tells core as its anchor
changes and at rest. A `go` is held at its place as parts come in above it
until a hand moves the pane; a resize keeps the part at the reading line
where it was. Linked, the pane a finger (or a wheel) last moved leads, and
`follow.js` (core/follow.l8's rules, `make bible-follow-test` checks them
against its cases) places the other each frame. The page's chapter is in
the address (`/read/bsb/john/3`, said to core as `place C 0 0` before
`start`). Core's screens are in a panel beside the reader on a wide window
and under it on a narrow one (the page's reading line then a third of the
way down what is above the panel), each screen an entry of the browser's
history (Back is the browser's), the selection's toolbar floating over the
text, menus where a phone has sheets, the browser's voice for Listen and
its wake lock for Keep Screen On. Core's words that named the phone are the
host's (`sk_device`, `sk_follows_text_size`).

Offline support uses a Service Worker
(`web/page/sw.js`, `/read/sw.js`, its build's files filled in by
`build.py`) that keeps the shell as it installs and each data file as the app
first reads it (those read before it was there handed over by the page),
and answers every reader's address with the shell kept; never the site's
`/api/` or the recordings. The manifest (`/read/manifest.webmanifest`)
makes it installable, and the browser is asked to keep its storage once
something of the reader's is kept.
