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
| The app | `core/ui.l8`, `core/screens.l8`, `core/prefs.l8` | Every screen as data, what each action does, the settings. No platform. |
| A skin | `ios/`, `android/`, later `web/` | Draws screens and a few views of its own, gives core the platform (files, network, voice, sharing). |

A skin decides **how** things look and move (a sheet or a pushed screen, a
switch or a checkbox, the platform's fonts and icons). Core decides **what**
is there and **what happens** (which rows a screen has, their words, what a tap
does to the app's state, where the reader goes next).

## Screens as data

A screen is built by core when it is shown and again whenever core says it
changed. It is a title, sections, and rows:

- **Screen**: an id (its instance, from core), its kind and argument (Go
  To's chapters of book 42), a title, an optional search field (its
  placeholder; typing is an action), and toolbar actions.
- **Section**: a header and a footer (either may be empty), and rows.
- **Row**: a kind, and what it shows and does:
  - `item`: title, detail (a subtitle, or a value on the right with
    `value`), icon, accessory (`more` for a disclosure, `check`, `info`),
    disabled, destructive. A tap is its action.
  - `toggle`: title and on/off. Changing it is its action with the value.
  - `choice`: title and options (a segmented control on an iPhone, a
    radio group or spinner elsewhere), the one chosen.
  - `slider`: title, minimum, maximum, value.
  - `field`: placeholder and text.
  - `button`: a full-width action (Listen from John 3).
  - `custom`: a view the skin makes itself (below), with an argument.
- **Text** is plain UTF-8, or styled runs (a verse preview, search matches in
  bold) using the reader's styles (`STYLE_*`, layout.l8), so a skin that can
  draw the reader can draw these.
- **Icons** are named as Apple's SF Symbols name them (`book`,
  `magnifyingglass`); each skin maps the names it needs to its own icons,
  or shows none.
- **Accessibility**: a row may carry a spoken label and named custom actions,
  which the skin exposes as its platform does.
- **Actions** are numbers chosen by the screen's kind: `(screen id, action,
  argument, value)`. A skin never interprets them; it hands them back.

## What happens: effects

Core answers an action by changing its state and returning effects, which
the skin carries out in its own idiom:

| Effect | iPhone | Android | Web (WEB.md §W17) |
|---|---|---|---|
| `push kind arg` | pushed in the sheet | new page in the panel stack | panel view with a URL |
| `present kind arg` | a sheet | a full-height panel | panel |
| `pop`, `dismiss` | pop, dismiss | back, close | history back, close |
| `update id` | rebuild that screen's rows | same | same |
| `jump c v` | the reader moves there | same | same |
| `relayout` | the reader's text laid out again (settings) | same | same |
| `share`, `open`, `copy` | share sheet, Safari view, pasteboard | intents, clipboard | Web Share, link, clipboard |

The platform's Back is always the skin's: it pops or dismisses, and tells
core (`closed id`) so it can let a screen go.

## Views a skin makes itself

Lists cover most of the app (the survey of 2026-10-21: 16 of 27 cell
kinds are plain rows, 8 more add one control). These are drawn by each skin,
from data core gives them:

1. **The reader**: chapters as laid-out runs (`ChapterLayout`, `measure_chapter`),
   continuous; its place reported back as chapter, verse and fraction.
2. The bar and title; the selection tray; the back capsule.
3. The chapter grid (Go To), Compare, the interlinear, Practice and cards, the
   Manual's pages, the share card, the mini player.

Each needs a view model in core (what it shows, what its taps do), written as
it is reached. The reader's already exists.

## Settings

`core/prefs.l8` keeps the settings as integers by name, with the names the
iPhone's defaults already use (`sizeStep`, `theme`, `showVerseNumbers`, ...). A
skin loads and saves them as text (`name value` lines), or maps them to its
platform's store.

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

From core:

| Line | Meaning |
|---|---|
| `screen ID KIND ARG` TITLE SEARCH | a screen built; then its `section` and `row` lines, then `end` |
| `section` HEADER FOOTER HOST BUTTON ACTION | a section of the screen; HOST, if not 0, a section the platform makes itself (core/skin.l8's `HOST_`: Go To's ribbons and plan, Search's ESV results, only where the host has them); BUTTON, a button in its header doing ACTION (Recent Searches' Clear) |
| `field` TEXT WAIT FLAGS | after `screen`, if it has a field: its words now, how long typing rests before it is sent (ms; 0 at once), `g` Return goes (Go To), `f` it takes the keys as the screen opens |
| `scopes` VALUE TITLES LABELS | the field's scopes (titles and spoken labels split by `\|`), the one chosen |
| `plain` | a plain list, not grouped (Search's results) |
| `focus N [1]` | after `screen`: the screen opens at its Nth row (of all, from 0): Go To at the book read; 1, selected too (the day a plan's days were opened for) |
| `intro` TEXT | words above the first section (a plan's description) |
| `toolbar` ACTION ARG TITLE STYLE | a button at the screen's foot doing ACTION with ARG (Start Plan): STYLE 0 plain, 1 prominent, 2 destructive (Stop Plan), 3 off |
| `row` KIND ACTION ARG TITLE DETAIL ICON ACC FLAGS VALUE OPTIONS LO HI LABEL | a row (below); LABEL what a screen reader says, if not its words |
| `present ID`, `push ID`, `update ID`, `pop`, `dismiss` | what to do with screens |
| `refill ID FADE` | screen ID made again as its field is typed in: its rows at once, the field as it is (FADE 1: what it shows changed kind, recent searches giving way to results: a cross-fade) |
| `retext ID` | screen ID's field to show the screen's words (a recent search chosen) |
| `blur ID` | the keyboard put away (Return in Search) |
| `marked SLOT DAY`, `plan_start P`, `plan_stop P` | a plan's day marked read or not (the host keeps the plan's file, says today is done, schedules its reminders); Start Plan and Stop Plan, the host's (its files, reminders and the day's reader) |
| `searched`, `esv_search PAGE` | Search searched again (a platform's own results for what it searched before are gone); the ESV's search asked for (the iPhone's, from its server) |
| `reader N` | the reader has N chapters (the version changed, or at the start) |
| `chapter C` TEXT | chapter C's text; then `span A B STYLE PARA` (UTF-16 places; core/text.l8's `STYLE_` and `PARA_`) and `verse V A B` lines, then `end` |
| `jump C V`, `relayout` | the reader moved; every chapter to be asked for again |
| `open WHAT` | open a screen still the platform's own (core/skin.l8's `OPEN_`: Glosses, Voice, the Manual, Acknowledgements) |
| `listen`, `settings` | Listen's button tapped; a setting changed that doesn't lay the text out again (the reading speed, Keep Screen On) |
| `look SIZE SPACING MARGIN DARK RED BG INK HEADING FAINT ACCENT RULE` | sizes in thousandths of the default (19 points), margins in points, colors as hex: all a skin needs of look.l8 |
| `title` TEXT, `version` TEXT | the bar's title (the chapter at the top) and the version's abbreviation |

After `screen`, an `empty` SYMBOL TITLE LINE line says what it shows with
no rows, and a `button` TITLE line its button at the top, followed by
`command` ACTION ARG TITLE FLAGS lines, its menu (`x`: destructive).
A row ends with TRAILING (words at its end: a time), DELETE (the action
swiping it away does; 0: it can't be), CUSTOM (its own presentation, where a
skin has one: core/skin.l8's `CUSTOM_`, the settings' Listen button, size
control, theme swatches and font samples; a skin without one draws the row
by its kind) and HINT (what VoiceOver adds). `goto C V` puts the screens away and
moves the reader (the iPhone's own jump).

A row's KIND is `item`, `toggle`, `choice`, `slider`, `field`, `button` or
`custom`; ACC is empty, `more`, `check`, `info` or `done` (a faint check: today's reading read); FLAGS are letters: `d`
disabled, `x` destructive, `o` on, `v` the detail is a value on the right, `s`
the detail is the Bible's words (the divine name in small capitals), `f` its
words faint (nothing to do), `b` strong (the row to go to, or where the
reader is: its title heavier, its icon larger, its words up to two lines),
`t` its title in the accent (a link: Show All), `g` its icon faint; after
HINT, MARKS: places in the detail to stress, pairs of UTF-16 offsets split by
spaces (the words a search found), and LINES, the most lines of its detail
(0: as many as it needs), then CIRCLE and CIRCLE_ACTION: a circle at its
start (0 none; 1 empty, 2 half, 3 full: a plan's day not read, partly,
read) doing CIRCLE_ACTION with the row's ARG; `m` its detail smaller (a
note: Versions' lines), `k` its circle dimmed and inert (a plan not
followed), `a` its trailing words in the accent (Today); a
choice's OPTIONS are its labels split by `|`, VALUE the one chosen; a slider
goes from LO to HI.

From the skin:

| Line | Meaning |
|---|---|
| `start W H DENSITY DARK` | the app begun: the window (points), its scale (hundredths), the system's appearance |
| `tap goto`, `tap versions`, `tap settings`, `tap history`, `tap search` | the bar's buttons (History, for now) |
| `act ID ACTION ARG VALUE` | a row's action (VALUE: a toggle's 1 or 0, a choice's index, a slider's value). An action on a screen means those over it have gone |
| `query ID TEXT` | screen ID's field typed in (TEXT to the line's end), once typing has rested the screen's WAIT |
| `scope ID N` | scope N chosen in screen ID's field |
| `submit ID` | Return (Go) in screen ID's field: its first suggestion |
| `closed ID` | the skin closed screen ID (and those over it) |
| `want C` | chapter C's text, to show |
| `place C V FRAC` | the reader's top: chapter, verse, thousandths of an em into it |
| `dark 0/1` | the system's appearance changed |
| `away` | the app put away: the settings kept now |

A host in L8 (android/main.l8) reads files and keeps the settings for core
(`sk_host`), and handles lines of its own before core's (Android's `files DIR`).
A version core wants that isn't loaded is asked for in `sk_want_text`: the
host loads it in its own loop (a text is kept for good, so loading it can't
happen inside an action) and calls `sk_use_version` again.

## The iPhone as a skin

`ios/skin.l8` draws core's screens in the app's own lists: eight slots in
the table registry (`ios/tables.l8`) whose rows come from core's records,
not the wire (`ui_wire` is off, and effects queue in `ui_effects`). A row's
action goes to core (`sk_act`); its effects are done the iPhone's way
(`push` into the navigation the action came from, `present` as a sheet,
`update` a cross-fade and reload, `dismiss`). The platform's work stays the
app's: core's version switch is the iPhone's `switch_version`. Moved so far:
Versions, History, the reading settings, Go To, Search, Reading Plans and a
plan's days (2026-10-21; a plan's reminder is a host section, its switch
and time the iPhone's notifications). Core's screens are the app's own controller class
(`L8CoreList`), made again as they come back from a screen pushed over
them.
Search's recent searches stay in the iPhone's defaults (`recentSearches`):
core keeps them while it runs and asks the host to keep them
(`SK_KEPT_SEARCHES`). Its ESV results, from the iPhone's server, are a host
section in place of core's results once asked for; the row that asks is
core's, its state line the host's words.

Go To shows how a screen moves while parts of it are still the iPhone's
own. Its ribbons and reading plan are host sections: core places them
(first, as `HOST_RIBBONS` and `HOST_PLAN`) and ios/skin.l8 hands their
rows, taps, swipes and ⓘ to ios/daily.l8 as before, which animates them
itself (their section numbers are unchanged). A book's chapters are
core's screen on Android, and on the iPhone its own grid (`push` of
`SCR_CHAPTERS` opens `show_chapters`). Recent is taken as Go To opens and
kept while it shows, so that a row changed under it by the app's own
sections can't change Recent's count in the middle of a table update.
The controller is the app's own class (`books_class`), for its first
layout at core's focus and its ribbons made again as it comes back. The settings are
kept by the iPhone as before: ios/skin.l8 copies them into core's
(`uk_prefs_from_app`) before a screen is built, and does a change core
made the app's way (`uk_app_from_prefs`: the theme's fade, red letters,
Keep Screen On). A host says what its platform has (`sk_has_listen`,
`sk_fonts`, ...) and gives the words only it knows (`SkinHost.words`).

## Moving the iPhone

One screen at a time, keeping its look: its rows come from core, drawn by a
generic UIKit renderer plugged into the table registry (`ios/tables.l8`); its
actions go to core. Each move is checked in a TestFlight build before the next,
because the UI can't run on the development machine. Screens with custom cells
keep them, as custom rows, until core has their view models.

## Android, the first skin

Built as Better's is (`tools/android/`, no Gradle): L8 as a shared library on
its own thread, Java's framework widgets (no AndroidX), data files from the
APK's assets copied to the app's files. The first slice:

1. The reader: every chapter, scrolled continuously, in the BSB, with verse
   numbers, headings, small capitals and the words of Jesus.
2. The bar's title, opening Go To: books, then a book's chapters, then the jump.
3. Versions: the bundled ones, switching the reader.
4. Settings: text size, theme, verse numbers, headings, footnotes, verse per
   line.

Then the rest of the app, screen by screen, each moved into core once and
shown on Android, and then on the iPhone.
