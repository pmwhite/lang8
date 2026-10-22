# Skins: the app in core, a platform's look around it

Owner, 2026-10-21: move the app's logic into core so that each platform is a
*skin*, a small platform-specific wrapper that draws what core describes and
so has every feature of the app without writing it again. The iPhone keeps
its look; its screens move onto the same descriptions one at a time. The
first new skin is Android.

## Layers

| Layer | Where | What it is |
|---|---|---|
| The Bible and what is kept | `core/*.l8` (text, layout, store, plans, memory, ...) | Data and rules. No platform, no screens. Unchanged by this. |
| The app | `core/ui.l8`, `core/skin.l8` and what it imports, `core/prefs.l8` | Every screen as data, what each action does, the settings, and the app's rules and words. No platform. |
| A skin | `ios/`, `android/`, `web/` | Draws screens and a few views of its own, gives core the platform (files, network, voice, sharing). |

What `core/skin.l8` imports, besides the screens' own files
(`learn_screens.l8`, `verse_study.l8`, `tray.l8`, `note.l8`):

| File | What it holds |
|---|---|
| `practice.l8` | Practice: a session's queue, steps, levels, typing, grades, cards, Practise Reading, each word's look, the buttons, Listen and Echo's verses and clips; its screen (`SCR_PRACTICE`) |
| `day.l8` | A plan's day: its rows, title, Mark Read, the day's end; following, stopping and marking plans; which days get reminders; its screen (`SCR_DAY`) |
| `reading.l8` | The reader's rests: chapters read (20 s at rest, end seen), the carried ribbon moving, dwelling into the history |
| `jump.l8`, `back.l8` | What a jump does (the way back, the history, the ribbon put down), the capsule and its return, opening a ribbon |
| `listen.l8` | Listen's words, what comes next, listening through a day |
| `preview.l8`, `footnote.l8` | A reference's preview and a footnote: what they show; their screens |
| `share.l8`, `word.l8`, `keys.l8` | The share card's words; a Hebrew or Greek word's popover; the keyboard's commands |
| `esv_client.l8` | Asking for the ESV's chapters (one at a time, the client's limit, resting, the reader's window) and taking them |
| `words.l8` | Words no one screen owns: counts, labels, toasts, the controls' titles |
| `kept.l8` | What is kept: the files (as the iPhone names them), what goes in each, saving and loading them; a host only reads, writes, adds to and deletes one by name (`kept_store`) |

A skin decides **how** things look and move (a sheet or a pushed screen, a
switch or a checkbox, the platform's fonts and icons). Core decides **what**
is there and **what happens** (which rows a screen has, their words, what a tap
does to the app's state, where the reader goes next).

## A new skin: the contract

A new platform gets every feature by doing what this list says and no more
(owner, 2026-10-22: the more skins, the more generic core). Anything a
feature needs beyond it is a gap in core, to be closed there, not in the
skin. The web is the reference: `web/main.l8` (the platform, about 120
lines) and `web/page/skin.js` (the skin).

**1. The platform, in L8** (core's host, `core/host.l8`, does the rest):

- `kept_store = KeptStore { read, write, append, remove }`: one named file
  (`kp_name`) read into `fbuf`, written from it, added to, deleted
  (`core/kept.l8` names them and says what goes in each).
- `host_io = HostIO { ask, http, file, say }`: a data file asked for by
  name (the site's `data/` names: `bsb` ... `ylt`, `orig.txt`, `lang/*`,
  `help.txt`, `xrefs.bin`, `mhcc.txt`, `audio/*.tim`,
  `audio/henson.paths`), a GET, a file or answer's bytes, lines to the
  skin.
- `hs_start()`, then what the platform is: `sk_device` (its name: "Device",
  "Phone"), `sk_follows_text_size`, `sk_fonts` (its reader's faces, in the
  settings' order), `hs_notify_off` (where notifications are turned back
  on, if not its Settings).
- A loop: wait for lines, take them into `hs_inbox` (the web's `bw_take`), `hs_lines(n)`,
  `hs_after()`. Kept allocations happen only here, never in a callback.
- Its own lines in: `got ID SIZE` (a data file came; -1 none), `http ID
  STATUS SIZE` (an answer came), `api BASE` (the site's `/api/v1/`).

**2. The skin draws** what core describes:

- Screens: `screen` ... `end` with every row kind, and these `CUSTOM_`
  kinds where the plain row won't do: `CUSTOM_SWATCHES` (colors to choose),
  `CUSTOM_CARD` (Share as Image's card, drawn at its pixels),
  `CUSTOM_FONT` (each font in its own face), `CUSTOM_HIT` (a verse found).
  The others may show as their kind's row. Their placement: `present`,
  `push`, `present_over`, `panel`, `update`, `refill`, `retext`, `blur`,
  `focus`, `pop`, `pop_to`, `close`, `dismiss`; the skin's own Back says
  `closed ID`.
- The reader: `reader`, then `chapter`, `span`, `verse`, `link` and `mark`
  lines as it asks (`want C`); `look`, `title`, `version`, `jump`, `goto`,
  `place`, `relayout`, `page`; `selection`, `carried`, `hearing`, `back`,
  `wake`. It says where it is: `rest`, `moving`, `tick`, `jumped`, `place`.
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
| Keys | `key NAME MODS` |
| Recordings | `audio_play`, `audio_stop` → `audiotime`, `audioended`, `audiofailed` |
| Its voice | `voices` (once); `say`, `speech_stop` → `spoke`, `spoken` |
| Listening's controls | `listen_pause`, `listen_resume`, `listen_stop`, `follow`; `listenplay`, `listenpause`, `listenprev`, `listennext`, `listenstop` (its own player's too: a lock screen's) |
| Time | `timer TOK MS` → `timer TOK` |
| The screen kept on | `awake MS` |
| Reminders | `notify_ask` → `notifyok`; `notify_clear`, `notify`; one opened → `reminded` |
| Sharing | `copy`, `share`, `share_image`, `savefile`, `url` |

**4. A skin on core's host never gets** the lines for a host with views or
state of its own (the iPhone's): `open`, `plan_today`, `plan_details`,
`plan_stopped`, `marked`, `ribbon_added`, `ribbon_open`, `ribbon_moved`,
`ribbon_color`, `ribbon_toast`, `read_in`, `practice_session`,
`practice_audio`, `preview`, `footnote`, `study_moved`, `esv_want`,
`esv_search`, `searched`, `mm_fetch`, `pins_changed`, `export`, `remind`,
`remind_time`, `open_settings`, `audio_source`, `voice`, `cellular`,
`download`, `download_delete`, `settings`, `chosen`. It may ignore any line
it doesn't know.

What core's host turns on for its skins: ribbons and plans, Listen, Keep
Screen On, reminders, Share as Image, the Manual and Acknowledgements.
Downloads (`sk_has_downloads`) need a platform that keeps recordings; the
web's can't (their hosts don't allow pages to read them), so it streams.

## Screens as data

A screen is built by core when it is shown and again whenever core says it
changed (`core/ui.l8`'s records; `core/skin.l8` and `core/learn_screens.l8`
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
    list.
  - `custom`: a view the skin makes itself (below), with an argument.
  Any row may also have: a circle at its start (a plan's day), a glyph in a
  column of its own at its start and words at its end (a letter's example),
  a note under its detail, faint words after its title, a ⓘ doing an
  action, actions a screen reader offers (and shown as a menu at its end),
  an action its swipe does, a spinner, and a grid's cells (Forms).
- **Text** is plain UTF-8, or set by runs: `END:STYLE` pairs (UTF-16 places)
  using the reader's styles (`STYLE_*`, text.l8) or core's own (`RUN_*`,
  ui.l8: a verse's number, Greek and Hebrew, a transliteration, faint,
  strong, plain, small, italic, the accent). A row's title, detail and side
  words, the intro and the hero's line may have runs; a detail may have
  marks instead (the words a search found).
- **Icons** are named as Apple's SF Symbols name them (`book`,
  `magnifyingglass`; `ribbon` is the app's own glyph); each skin maps the
  names it needs to its own icons, or shows none.
- **Accessibility**: a row may carry a spoken label, a hint and named
  custom actions, which the skin exposes as its platform does.
- **Actions** are numbers chosen by the screen's kind: `(screen id, action,
  argument, value)`. A skin never interprets them; it hands them back.

A screen belongs to a *group*: the sheet (0) or, on a wide window, the
panel beside the reader (1). Closing one lets its group go, the other kept;
a screen may also be presented over the sheet up (a note over the Library),
which stays.

## What happens: effects

Core answers an action by changing its state and returning effects, which
the skin carries out in its own idiom:

| Effect | iPhone | Android | Web (WEB.md §W17) |
|---|---|---|---|
| `push id`, `present id` | pushed in the sheet the action came from; a sheet | a page in the panel stack; a full-height panel | panel view with a URL |
| `pop`, `pop_to id`, `dismiss` | pop, pop to it, dismiss | back, back to it, close | history back, close |
| `present_over id`, `close id`, `panel id` | a sheet over the sheet; that screen's sheet away; in the panel beside the reader | a panel over the panel; back; a panel | same |
| `update id`, `refill id fade`, `refresh` | that screen's rows made again; again as its field is typed; every screen | same | same |
| `jump c v`, `goto c v`, `relayout` | the reader moves there; the sheets away, then there; laid out again | same | same |
| `url` ADDRESS | Safari | the browser | a link |
| `settings` | a setting kept the platform's way | (prefs kept by core) | same |

The platform's Back is always the skin's: it pops or dismisses, and tells
core (`closed id`) so it can let a screen go. Effects for what only a
platform does are the host's (below); a skin that doesn't do one ignores it.

## Views a skin makes itself

Every list in the app is core's, and so are (2026-10-22) the chapter grid,
a verse's Study (the interlinear, cross references, the commentary), a
word's definition, the Manual's pages, the note editor, the selection
tray and its menus (`tapverse`, `trayact`), the title's menu (`titlemenu`,
`menuact`), Practice (below), a plan's day, a reference's preview and a
footnote. What each skin still draws itself is drawing only, from core's
models, words and rules:

1. **The reader**: chapters as laid-out runs (`ChapterLayout`,
   `measure_chapter`; `chapter`, `span`, `verse`, `link` and `mark`
   lines), continuous; its place, rests and jumps told back.
2. The back capsule (`back` WORDS), the mini player (`core/listen.l8`'s
   words), the share card (below), the text's own menu
   (`core/tray.l8`'s commands), a word's popover (`core/word.l8`), toasts
   (`toast`).

The iPhone keeps richer versions of some of core's screens (its own
Practice sheet, day's reader, preview, footnote popover, jumps), each
drawn from core's state and saying so through `SK_NUM_OWN_VIEW` and
`SK_NUM_OWN_JUMPS`.

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
chapter's first and last, at most 80, the words around them): a skin with
its own (the iPhone's, in the reader's typesetting with its highlights;
`SK_NUM_OWN_VIEW` of `SCR_PASSAGE`) draws that plan; any other gets core's
screen, a page of the verses in the reader's styles and Open in Reader.

## Practice

`core/practice.l8` is Practice apart from any platform: a session's queue
(passages, cards, words to read), each passage's steps and level, the
words shown, helped and missed, typing's first letters, the grades, a
card's state, Practise Reading's rounds, and the end. Every opener (the
Library, a passage's row, the tray's Memorize, a language's cards,
Practise Reading, Learn 8 Letters) is core's `px_start`.

A skin without its own Practice gets core's screen (`SCR_PRACTICE`): the
passage as a page's paragraph whose runs are each word's look
(`RUN_PRACTICE` plus a look: its color, clear, ink, learned or faint; its
underline, the rule, the accent, half the accent or the accent dotted,
times 4; 32 the verse heard; 64 Greek, 128 Hebrew), a hidden word's tap
showing it and a verse number's its verse; the levels as segments; the
count at the bar's left; the step's buttons; a card's face as a hero and
paragraphs; the end as its empty words. A skin that plays a passage and
speaks a card says so (`SK_NUM_PRACTICE_AUDIO`), and one that takes typed
letters (`SK_NUM_PRACTICE_KEYS`); their buttons are left out otherwise.

The iPhone draws Practice in its own sheet (`SK_NUM_OWN_VIEW` of
`SCR_PRACTICE`: core
says `practice_session N HOW` once the session is queued), from the same
state: each action of core's says what changed (`px_changed`'s `PX_CH_`
bits: the words' looks, the buttons, a passage or card begun, the end,
the keys put away, playback stopped, a scroll, a tick felt), the words'
looks are core's runs (`px_looks`), the buttons core's list (`px_tools`),
and a card's words core's, part by part (`px_card_part`).

## Settings

`core/prefs.l8` keeps the settings as integers by name, with the names the
iPhone's defaults already use (`sizeStep`, `theme`, `showVerseNumbers`,
`librarySegment`, `learnHideKnown`, ...). A skin loads and saves them as
text (`name value` lines), or maps them to its platform's store.

## The wire, for skins in another language

Android's skin is Java, as the web's will be JavaScript, so they and core talk
in lines (UTF-8, `\n`-ended; fields split by tabs, a field's tab, newline and
backslash written `\t`, `\n`, `\\`). An L8 skin (the iPhone's) uses the same
records in memory and needs no wire. `core/skin.l8` reads the skin's lines
(`sk_line`) and writes its answers into `ui_out`; `tools/skin_text.l8` is
the whole wire on a terminal, for developing core without a phone:

```
printf 'start 400 800 100 0\ntap goto\nact 1 1 42 0\n' | .build/skin-text programs/bible/data /tmp/prefs
```

Its own lines make up what a test needs: `visit C V TIME`, `plans`, `plan P
D`, `follow P DAY`, `open KIND ARG` (any screen, presented), `compare C V N`,
`study C V K`, `esv C V WORDS` (a result of the ESV's own search), `memorize
C V1 V2` (a passage in Memory, to practise).

A screen, from core:

| Line | Meaning |
|---|---|
| `screen ID KIND ARG` TITLE SEARCH | a screen built; then the lines below, its `section`, `row` and `cell` lines, then `end` |
| `focus N [MODE]` | the screen opens at its Nth row (of all, from 0), at the top; MODE 1 selected and in the middle, 2 in the middle, 3 at the top and washed (a Manual's part gone to by a link) |
| `intro` TEXT RUNS QUOTE | words above the first section (a plan's description; the language page's); QUOTE 1, a quote (an accent's bar beside it) |
| `left` ACTION TITLE ICON STYLE | a button at the left of the bar, in place of Back (a note's Cancel; Practice's count, inert) |
| `hero` WORD SCRIPT SUB LINE RUNS | a word as the heading: large in its script (`RUN_GREEK`, `RUN_HEBREW`), its transliteration, a line under them |
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
| `empty` SYMBOL TITLE LINE | what it shows with no rows |
| `button` TITLE, then `command` ACTION ARG TITLE FLAGS | its button at the top and its menu (`x`: destructive) |
| `section` HEADER FOOTER BUTTON ACTION SUFFIX CREDIT COLUMNS | a section: a button in its header doing ACTION; faint words after its header; CREDIT 1 the ESV's under it; COLUMNS a grid's columns' names |
| `row` ... | a row (below) |
| `cell` ACTION ARG SCRIPT TEXT SUB COUNT LABEL TR FLAGS ACTIONS | after its row, a grid's cell or a tile: its words in a script (0 none: a faint "—"), what it does, its count, what a screen reader says, and its tap (ACTION 0: none); a tile's transliteration and what it hides (`UI_TILE_`), and the actions a screen reader offers |

A row's fields, in order: `row` KIND ACTION ARG TITLE DETAIL ICON ACC FLAGS
VALUE OPTIONS LO HI LABEL TRAILING DELETE CUSTOM HINT MARKS LINES CIRCLE
CIRCLE_ACTION SUFFIX ICON_COLOR NOTE INFO ACTIONS RUNS TRUNS TITLE_LINES
FIELD_KIND LEAD LEAD_STYLE SIDE SRUNS SIDE_NOTE ACTION_ICONS LINKS.

- KIND is `item`, `toggle`, `choice`, `slider`, `field`, `button`, `custom`,
  `time`, `text` or `tiles`; ACC is empty, `more`, `check`, `info`, `done` (a faint check) or
  `link` (a page outside the app).
- FLAGS are letters: `d` disabled, `x` destructive, `o` on, `v` the detail is
  a value on the right, `s` the detail is the Bible's words (the divine name
  in small capitals), `f` faint, `b` strong (the row to go to: heavier, its
  words up to two lines), `t` its title in the accent, `g` its icon faint, `m`
  its detail smaller, `k` its circle dimmed and inert, `a` its trailing words
  in the accent, `r` a field whose Return is the screen's confirm, `q` the
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
  a note's many lines); LEAD a glyph at its start in LEAD_STYLE's script;
  SIDE words at its end over SIDE_NOTE; LINKS a paragraph's links
  (`B:E:ACTION:ARG` split by `|`, B and E UTF-16 places in its title).

Other lines from core:

| Line | Meaning |
|---|---|
| `present ID`, `push ID`, `update ID`, `pop`, `pop_to ID`, `dismiss` | what to do with screens |
| `refill ID FADE` | screen ID made again as its field is typed in (FADE 1: a cross-fade) |
| `retext ID`, `blur ID` | the field to show the screen's words; the keyboard put away |
| `reader N` | the reader has N chapters |
| `chapter C` TEXT | chapter C's text; then `span A B STYLE PARA`, `verse V A B`, `link A B KIND ARG` (a footnote's mark, KIND 0, ARG its place; a reference, 1, ARG the reference; a word of the original's, 2) and `mark V HEX BOOKMARK NOTE` lines (a verse's highlight's color, `-` none; bookmarked; noted), then `end` |
| `jump C V`, `goto C V`, `relayout` | the reader moved; the screens away, then moved; every chapter to be asked for again |
| `look SIZE SPACING MARGIN DARK RED BG INK HEADING FAINT ACCENT RULE GLOSS FONT` | all a skin needs of look.l8: FONT the one chosen of the skin's own (`sk_fonts`, named in its settings' Font section, each row `CUSTOM_FONT` with the font's index as its argument) |
| `title` TEXT, `version` TEXT | the bar's title and the version's abbreviation |
| `url` ADDRESS | a page outside the app to open |
| `place C V*1000+FRAC`, `back` WORDS | the reader to a place (a ribbon's, the way back's); the capsule's words (none: away). A skin with jumps of its own (`SK_NUM_OWN_JUMPS`: the iPhone) does `core/jump.l8`'s steps itself and gets `goto`, `ribbon_open`, `ribbon_added` instead |
| `awake MS` | Keep Screen On: the screen kept on MS more (after a `rest`, a tap), or let go now (0: a sheet opened, the setting off). A skin offers the setting with `sk_has_keep_on` |
| `settings` | a setting changed that doesn't lay the text out again |

The host's effects (what only a platform can do; a skin without one ignores
it): `open WHAT` (a screen still the platform's own: core/skin.l8's
`OPEN_`), `listen`, `ribbon_added ID`, `ribbon_open I`, `ribbon_color ID`,
`chosen OWNER`, `marked SLOT DAY`, `plan_start P`, `plan_stop P`, `plan_today
SLOT`, `plan_details SLOT`, `remind WHO ON` (a reminder's switch: WHO 0
Memory's, else a plan's slot plus 1), `remind_time MINUTES`, `open_settings`,
`searched`, `esv_search PAGE`, `esv_want C`, `audio_source`, `voice`,
`cellular`, `download`, `download_delete`, `export`, `memorize C V` and
`mm_added VERSION` (an ESV passage, whose verses the host keeps; any
other version's is added by core, which toasts Added to Memory),
`mm_version`, `mm_delete`, `practice_session N HOW` (a host
with its own Practice), `practice_audio ACTION ARG` (Listen, Echo, Speak
on core's Practice), `toast SYMBOL` WORDS (a toast's words, and its
symbol: 0 plus, 1 a check, 2 the brain), `read_in CV RIBBON`
(the reader in the Hebrew and Greek), `study_verse`, `copy`, `share`,
`share_image` (Share as Image's card, above),
`highlighted`, `bookmarked`, `clear_selection`, `tray`, `tray_away`.

From the skin:

| Line | Meaning |
|---|---|
| `start W H DENSITY DARK TZ` | the app begun: the window (points), its scale (hundredths), the system's appearance, its time zone (seconds east of UTC: the day turns at its midnight) |
| `tap goto`, `tap versions`, `tap settings`, `tap history`, `tap search`, `tap library` | the bar's buttons |
| `act ID ACTION ARG VALUE` | an action (VALUE: a toggle's 1 or 0, a choice's, segment's, filter's or sort's index, a slider's value, a time's minutes, a swatch's color). An action on a screen means those over it have gone |
| `query ID TEXT` | screen ID's field typed in (TEXT to the line's end), once typing has rested |
| `scope ID N` | scope N chosen in screen ID's field |
| `text ID ACTION ARG TEXT` | a `field` row's words: its action with them |
| `submit ID` | Return (Go) in screen ID's field |
| `closed ID` | the skin closed screen ID (and those over it) |
| `want C` | chapter C's text, to show |
| `place C V FRAC` | the reader's top: chapter, verse, thousandths of an em into it |
| `dark 0/1` | the system's appearance changed |
| `esvstatus STATUS ESV`, `esvact WHAT C` | whether the site's Worker gives the ESV (STATUS its answer's, 0 none); a tap on chapter C's ESV line (`link` KIND 3: ARG `ESV_TRY`, `ESV_BSB`, `ESV_SITE`). Core asks for the ESV's chapters near the place as a wire skin reads it (its host's `fetch`), draws one not here as its line, and ends each with "(ESV) · esv.org" |
| `version ABBR` | the version an address names (`KJV`): before `start`, the one the reader opens in; after, read now |
| `away` | the app put away: the settings kept now |
| `word W` | a word of the original tapped (a `link` of KIND 2, its ARG the word): core's word screen (`SCR_WORD`: its form, where, transliteration, gloss, meaning, parsing; Learn This Word or its card's line; Word Study) |
| `tapverse C V`, `tapnone` | a verse tapped (core toggles it: another chapter's starts again), or the reader elsewhere (the selection let go); core says `selection` C V... (C -1: none) for the skin to paint, and writes the tray's model as screen 0 (`tray`, `tray_away`). A skin hit-tests in this order: a footnote's mark, a word of the original, a reference, a note's mark, the ESV's line, a chapter's note, then a verse (within a few points), else elsewhere |
| `select C V...` | the verses selected, whole (none: the tray away), for a skin that keeps its own selection |
| `trayact ACTION V`, `titlemenu`, `menuact ACTION ARG` | a tray's button; the title's menu's model, as screen 0; one of its items |
| `versestudy C V` | verse C:V's Study, as core's screen (a skin's answer to `study_verse`) |
| `spoke C V MS`, `spoken C V`, `listenstop` | the skin's voice began (MS its clock: following waits 8 s after a finger moves the reader) and finished saying verse C:V (0 the chapter's title), or was stopped: a skin without its own Listen (`SK_NUM_OWN_LISTEN`) speaks what core's session gives it (`say C V` WORDS, `player` TITLE STATE PLAYING READER VERSION (also for the platform's own player: a lock screen's, a headset's; its buttons `listenplay`, `listenpause`, `listenprev`, `listennext`, `listenstop`), `follow C V`, `listen_stop`) |
| `rest C V FRAC END ENDS_HI MS`, `moving MS`, `tick MS`, `jumped KIND` | the reader at rest (chapter, verse, thousandths of an em; its end on the screen; the last chapter whose end is; the skin's clock), begun to move (a finger's scroll), the time core asked for (`wake MS`), a jump (0 with a way back, 1 the capsule's, 2 neither): `core/reading.l8` counts chapters read (20 s at rest, end seen), moves the carried ribbon, and puts a chapter dwelt in 20 s onto the history |
| `back` | the capsule tapped: core goes back (`place`), or opens the plan's day it came from |
| `key NAME MODS` | a hardware keyboard's key (NAME its character, or `left`, `up`, `down`, `space`, `return`; MODS 1 ⌘ or Ctrl, 2 Shift, 4 Alt): `core/keys.l8` makes it a command and does it where it acts — Go To, Search, Library, Settings, chapters, Back, Listen, a page (`page 1` down, `page 0` up: the skin scrolls a screen less three lines), a plan's day's Mark Read and Next, Practice's Check and grades. The iPhone makes them `UIKeyCommand`s itself |
| `footnote C P`, `preview REF` | a footnote's mark tapped (its place P in chapter C), a reference tapped: core's footnote (`core/footnote.l8`) or preview, or the host's own (`SK_NUM_OWN_VIEW`) |
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

`ios/skin.l8` draws core's screens in the app's own lists: eight slots in
the table registry (`ios/tables.l8`) whose rows come from core's records,
not the wire (`ui_wire` is off, and effects queue in `ui_effects`). A row's
action goes to core (`sk_act`); its effects are done the iPhone's way
(`push` into the navigation the action came from, `present` as a sheet,
`update` a cross-fade and reload, a row deleted with the system's animation
when that is all that changed, `dismiss`). The platform's work stays the
app's: core's version switch is the iPhone's `switch_version`. Core's screens
are the app's own controller class (`L8CoreList`), made again as they come
back from a screen pushed over them; Go To's and Search's are the app's own
classes for their focus and keyboard.

Every list is core's (2026-10-22): Go To (its ribbons and plans too),
Search (the ESV's results too: the iPhone asks its server, core keeps and
shows them), Versions, History, the reading settings, Glosses, Voice and the
voices, Downloads, the Manual's list, Acknowledgements and Changes, Reading
Plans, a plan's days and its Daily Reminder, A Chapter a Day, Begin At, New
Ribbon and a ribbon's screen, the Library and Memory (Add Passage, a
passage, its versions, Memory's reminder), Compare, a word's study, its
grammar and concordance, the language page and what it pushes (Sounds
Written As, the Alphabet, Your Words, Add Words and its preview, Verses You
Can Read) and a lemma's Forms. The iPhone keeps what is kept in its files and
defaults, and core asks it to keep a change (`SK_KEPT_*`); its own state
core asks for by number (`SK_NUM_*`: a reminder's time, whether the phone has
turned notifications off) and by words (`SK_WORDS_*`). The settings are kept
by the iPhone as before: ios/skin.l8 copies them into core's
(`uk_prefs_from_app`) before a screen is built, and does a change core made
the app's way (`uk_app_from_prefs`: the theme's fade, red letters, Keep
Screen On).

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
tray's: `versestudy`), word studies, the Manual's pages and Learn work,
and the cards are kept. Reading Plans work there from core: following a plan
(its file plan-N.tsv, their numbers in plans.txt; `SK_KEPT_PLANS`), its
days, core's day's reader (`SCR_DAY`: its passages, Mark Read, the day's
end), Day Done. A skin with a day's reader of its own (the iPhone's)
says so (`SK_NUM_OWN_VIEW` of `SCR_DAY`, and of `SCR_PLAN`, `SCR_DAY1`,
`SCR_MANUAL`, `SCR_VOICE` for its own sheets) and gets the effects
instead. Still to do there: reminders; then the views above.

## The web, the second new skin

Core runs in WebAssembly (`web/main.l8`, built with `l8 wasm --async
bw_wait`): its host's loop waits on the page (`bw_wait`) as Android's
waits for its Java side, so what core keeps is made outside any callback.
The host asks the page for the data files by id (`bw_ask`: the site's
`data/HASH/NAME.gz`, each the page's fetch, given back as `got ID SIZE`),
reads the reader's version and the plans first, then what is kept, and
says `ready`; the language data comes after, and Study and Learn appear
once it has. What is kept is `core/kept.l8`'s files, a key each in the
browser's storage (`sb.NAME`).

The skin is JavaScript (`web/page/skin.js`), drawing core's wire the web's
way rather than the iPhone's: the reader is the page itself (its chapters
added as either end is scrolled to, the place in the address,
`/read/bsb/john/3`), core's screens in a panel beside the reader on a wide
window and over it on a narrow one, each screen an entry of the browser's
history (Back is the browser's), the selection's toolbar floating over the
text, menus where a phone has sheets, the browser's voice for Listen and
its wake lock for Keep Screen On. Core's words that named the phone are the
host's (`sk_device`, `sk_follows_text_size`).
