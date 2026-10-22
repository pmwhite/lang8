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
| The app | `core/ui.l8`, `core/skin.l8`, `core/learn_screens.l8`, `core/prefs.l8` | Every screen as data, what each action does, the settings. No platform. |
| A skin | `ios/`, `android/`, later `web/` | Draws screens and a few views of its own, gives core the platform (files, network, voice, sharing). |

A skin decides **how** things look and move (a sheet or a pushed screen, a
switch or a checkbox, the platform's fonts and icons). Core decides **what**
is there and **what happens** (which rows a screen has, their words, what a tap
does to the app's state, where the reader goes next).

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
  button with a menu (History's Clear), buttons at its foot (`tool`s: their
  place left, middle or right, a title or an icon, a style, and a menu),
  an index down its side (a concordance's books), and what it shows with no
  rows.
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

## What happens: effects

Core answers an action by changing its state and returning effects, which
the skin carries out in its own idiom:

| Effect | iPhone | Android | Web (WEB.md §W17) |
|---|---|---|---|
| `push id`, `present id` | pushed in the sheet the action came from; a sheet | a page in the panel stack; a full-height panel | panel view with a URL |
| `pop`, `pop_to id`, `dismiss` | pop, pop to it, dismiss | back, back to it, close | history back, close |
| `update id`, `refill id fade`, `refresh` | that screen's rows made again; again as its field is typed; every screen | same | same |
| `jump c v`, `goto c v`, `relayout` | the reader moves there; the sheets away, then there; laid out again | same | same |
| `url` ADDRESS | Safari | the browser | a link |
| `settings` | a setting kept the platform's way | (prefs kept by core) | same |

The platform's Back is always the skin's: it pops or dismisses, and tells
core (`closed id`) so it can let a screen go. Effects for what only a
platform does are the host's (below); a skin that doesn't do one ignores it.

## Views a skin makes itself

Every list in the app is core's (2026-10-22). These are still drawn by each
skin, and need view models in core, written as they are reached:

1. **The reader**: chapters as laid-out runs (`ChapterLayout`,
   `measure_chapter`), continuous; its place reported back as chapter, verse
   and fraction. Its view model exists (`chapter` and `span` lines).
2. The bar and title and its menus; the selection tray and its menus; the
   back capsule; the mini player; the day's reader.
3. The chapter grid (Go To; Android draws core's list), the Study sheet (its
   segments: the interlinear, cross references, the commentary), Practice and
   its cards, the Manual's pages, a definition, the note editor, the share
   card.

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
`study C V K`, `esv C V WORDS` (a result of the ESV's own search).

A screen, from core:

| Line | Meaning |
|---|---|
| `screen ID KIND ARG` TITLE SEARCH | a screen built; then the lines below, its `section`, `row` and `cell` lines, then `end` |
| `focus N [MODE]` | the screen opens at its Nth row (of all, from 0), at the top; MODE 1 selected and in the middle, 2 in the middle |
| `intro` TEXT RUNS | words above the first section (a plan's description; the language page's) |
| `hero` WORD SCRIPT SUB LINE RUNS | a word as the heading: large in its script (`RUN_GREEK`, `RUN_HEBREW`), its transliteration, a line under them |
| `index` TITLES | an index down the list's side, a title each section (split by `\|`) |
| `confirm` ACTION TITLE OFF | the confirming button at the top, in place of Done (OFF 1: not yet) |
| `tool` ACTION ARG TITLE ICON LABEL STYLE PLACE MENU | a button at the foot: its title, or ICON and the spoken LABEL; STYLE 0 plain, 1 prominent, 2 destructive, 3 off; PLACE 0 left, 1 middle, 2 right; MENU, if any, its items `ARG:TITLE` split by `\|`, each doing ACTION with its ARG |
| `segments` ACTION CHOSEN LABELS | segments over the list; choosing one is ACTION with its index as VALUE |
| `filter` ACTION CHOSEN COLORS LABELS | a filter by color: All, then a circle each (hex, spoken labels); choosing is ACTION with its index (-1 All) |
| `sort` ACTION CHOSEN TITLES | how its rows are sorted, a menu; choosing is ACTION with its index |
| `field` TEXT WAIT FLAGS | its field's words, how long typing rests before they are sent (ms), `g` Return goes (Go To), `f` it takes the keys as the screen opens |
| `scopes` VALUE TITLES LABELS | the field's scopes, the one chosen |
| `plain` | a plain list, not grouped |
| `empty` SYMBOL TITLE LINE | what it shows with no rows |
| `button` TITLE, then `command` ACTION ARG TITLE FLAGS | its button at the top and its menu (`x`: destructive) |
| `section` HEADER FOOTER BUTTON ACTION SUFFIX CREDIT COLUMNS | a section: a button in its header doing ACTION; faint words after its header; CREDIT 1 the ESV's under it; COLUMNS a grid's columns' names |
| `row` ... | a row (below) |
| `cell` ACTION ARG SCRIPT TEXT SUB COUNT LABEL | after its row, a grid's cell: its words in a script (0 none: a faint "—"), what it does, its count, what a screen reader says, and its tap (ACTION 0: none) |

A row's fields, in order: `row` KIND ACTION ARG TITLE DETAIL ICON ACC FLAGS
VALUE OPTIONS LO HI LABEL TRAILING DELETE CUSTOM HINT MARKS LINES CIRCLE
CIRCLE_ACTION SUFFIX ICON_COLOR NOTE INFO ACTIONS RUNS TRUNS TITLE_LINES
FIELD_KIND LEAD LEAD_STYLE SIDE SRUNS SIDE_NOTE ACTION_ICONS.

- KIND is `item`, `toggle`, `choice`, `slider`, `field`, `button`, `custom`
  or `time`; ACC is empty, `more`, `check`, `info`, `done` (a faint check) or
  `link` (a page outside the app).
- FLAGS are letters: `d` disabled, `x` destructive, `o` on, `v` the detail is
  a value on the right, `s` the detail is the Bible's words (the divine name
  in small capitals), `f` faint, `b` strong (the row to go to: heavier, its
  words up to two lines), `t` its title in the accent, `g` its icon faint, `m`
  its detail smaller, `k` its circle dimmed and inert, `a` its trailing words
  in the accent, `r` a field whose Return is the screen's confirm, `q` the
  words its screen's field searches for marked in it, `w` waiting (a
  spinner), `l` a field whose words go to core as they are typed, `u` its
  actions also a menu at its end.
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
  its title; FIELD_KIND what a field takes (0 a name, 1 a reference); LEAD a
  glyph at its start in LEAD_STYLE's script; SIDE words at its end over
  SIDE_NOTE.

Other lines from core:

| Line | Meaning |
|---|---|
| `present ID`, `push ID`, `update ID`, `pop`, `pop_to ID`, `dismiss` | what to do with screens |
| `refill ID FADE` | screen ID made again as its field is typed in (FADE 1: a cross-fade) |
| `retext ID`, `blur ID` | the field to show the screen's words; the keyboard put away |
| `reader N` | the reader has N chapters |
| `chapter C` TEXT | chapter C's text; then `span A B STYLE PARA` and `verse V A B` lines, then `end` |
| `jump C V`, `goto C V`, `relayout` | the reader moved; the screens away, then moved; every chapter to be asked for again |
| `look SIZE SPACING MARGIN DARK RED BG INK HEADING FAINT ACCENT RULE` | all a skin needs of look.l8 |
| `title` TEXT, `version` TEXT | the bar's title and the version's abbreviation |
| `url` ADDRESS | a page outside the app to open |
| `settings` | a setting changed that doesn't lay the text out again |

The host's effects (what only a platform can do; a skin without one ignores
it): `open WHAT` (a screen still the platform's own: core/skin.l8's
`OPEN_`), `listen`, `ribbon_added ID`, `ribbon_open I`, `ribbon_color ID`,
`chosen OWNER`, `marked SLOT DAY`, `plan_start P`, `plan_stop P`, `plan_today
SLOT`, `plan_details SLOT`, `remind WHO ON` (a reminder's switch: WHO 0
Memory's, else a plan's slot plus 1), `remind_time MINUTES`, `open_settings`,
`searched`, `esv_search PAGE`, `esv_want C`, `audio_source`, `voice`,
`cellular`, `download`, `download_delete`, `export`, `note C V`, `mm_add`,
`mm_added`, `mm_version`, `mm_delete`, `passage`, `practice`, `practice_all`,
`cards LANG`, `practice_reading LANG`, `practice_new N` (Practice of core's
`sk_pq`), `learned LANG`, `words_added N`, `read_in CV RIBBON` (the reader
in the Hebrew and Greek), `definition`, `add_to_note`, `interlinear`.

From the skin:

| Line | Meaning |
|---|---|
| `start W H DENSITY DARK` | the app begun: the window (points), its scale (hundredths), the system's appearance |
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
| `away` | the app put away: the settings kept now |
| `refresh` | what core's screens show has changed (the host's own state): each made again |

A host in L8 (android/main.l8) reads files and keeps the settings for core
(`sk_host`: `save_prefs`, `save_kept` for what is kept, `words` and `num`
for what only it knows, `fill` for its lists), and handles lines of its own
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
Greek page, the Alphabet, the reading settings). Still to do there: the
language data and what is kept (ribbons, history, marks, cards) as files, so
that Study, Learn and the Library have something to show; then the views
above.
