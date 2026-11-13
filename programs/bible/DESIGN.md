# Smooth Bible architecture

The app separates shared behavior from platform presentation. Core owns the
text, references, saved data, navigation rules, settings, study, plans,
learning and practice. A skin draws the app and supplies platform services.

## Shared core

`core/skin.l8` and `core/ui.l8` describe screens and route actions.
`core/study_screens.l8` owns study subjects, the derived lexical cache,
grammar screens and concordance filtering. Its entry points open or ready a
subject and build its screens; concordance changes go through its operations.
Study values shared with definition/forms screens describe the readied subject.
Cache construction, row helpers and filter storage carry an internal tag.

The screen coordinator retains navigation, platform-service callbacks and action
routing. Those operations share the screen stack and host contract; they stay
together even where their combined size exceeds the module-size heuristic.
`core/host.l8` runs the line-based host used by every platform.
`core/kept.l8` loads and saves named user files. Data modules handle text,
study records, original languages, audio timings and the ESV cache.
`core/beside.l8` keeps the panel beside the page: its reader, the
document read beside the page (a version or a commentary), and Study
over it when a verse is studied; nothing else stacks there. It is kept
while sheets come and go and opened again as it was left. The reader's
name opens Go To, its picks landing in the panel, to read another
document there; with nothing read there yet, the bar's panel button
opens that Go To, and the panel opens once something is picked. Each
skin shows the panel its platform's way (on iOS, a sheet over the page,
or a column beside it on an iPad window with room for both);
where it is a column it can't fill the screen, and its menu has no Full
Screen (`panelfill`). `core/panes.l8` keeps the two
panes, the page and the panel's reader, the same way on every skin: each
reads its document a part at a time (a version's chapter in parts of its
verses from one that begins a paragraph; a commentary's, about 2 KB of its
folio from one of its marks), every chapter in turn, as the skin asks for
the parts near what it shows. The skin says how tall each part it laid
out is and where each of its anchors begins (a version's verses, a
commentary's comments' first verses), and where each pane's reading line
is as it moves, in places, and core says which anchors of one go with
which of the other (a chapter's link map). Linked (a button in the
panel's bar), the two panes keep linked sections in sight, the same way
whichever a hand moves and whatever either reads (`core/follow.l8`): the
section at the top of the page (or the linked one nearest it) has one
linked with it in sight in the panel, wholly if it is shorter than the
panel, filling it if it is taller. While that holds nothing moves; when it
breaks, the pane the hand isn't moving glides at once, quickly, by as
little as makes it hold (a verse brought in at the panel's foot going on,
at its top coming back; a long comment filling the panel, its end at the
foot coming back up). A jump (Go To, a link, the way back, Swap Panes)
moves both panes at once, and neither follows the other again until a
hand moves one. Chapters a commentary says nothing on,
in a run, are one part of it, shown wherever the page is in them. The page reads the Bible or a commentary (Swap Panes trades
what the two panes read); a place, the page's, the history's, a
ribbon's or the way back's, is in the Bible (whichever version is read)
or in a Bookshelf module (kept by its name), and going back to one reads
its document on the page again. Each pane is read at one line:
the page's a third of the way down (where Go To leaves a verse), the
panel's at its top.
`core/shelf.l8` keeps the Bookshelf: SWORD modules fetched when they are
first opened rather than bundled. It has no screen of its own (it isn't
the reader's Library of highlights, notes, bookmarks and Memory), and
whether a module is on the device is never shown: documents open wherever
they are kept. A module is made as part of its download: a Bible becomes
a version in a text slot of its own, and a commentary, dictionary or book
a folio (`programs/folio`), read a chapter, an entry or a part at a time
while a screen shows it, so opening it reads only the folio's head. An
update is fetched quietly once the catalog says there is one (not on a
metered connection) and made beside the copy read (a made module's file
has two names, its line in `shelf.tsv` saying which it is), which is read
meanwhile; once it is kept the line names the new copy, the old is
deleted, and each pane reading the module is sent its parts again and to
the place it said last, at once (a commentary's once the new copy is open
and the parts there are read, so that no pane is ever empty or shows
another document). One that fails leaves the old copy, and nothing says
so; one the app closes before it is made is let go. Modules fetched while
another is being made wait their turn, what a pane waits for first.
Making happens a step at a time between the screen's updates (core asks
the skin for a turn with `next`), so the app keeps answering its reader
however slowly it runs, as it does interpreted under hot reload. Where
every Bible's place is taken, opening another lets go of the one read
longest ago that no pane shows.
Go To lists what can be read (`core/documents.l8`) and is one screen
wherever it opens: the same title, sections, rows and marks, always
presented and opened at its top; its argument says only where a pick
lands, the page (the bar's title) or the panel (the panel's name). Nothing
typed, it shows the ribbons and plan, Recent, Documents (the page's
document, the panel's, then the others read, the latest first, up to six
with the Bibles that come with the app), Browse (each kind and the
languages, a count each; a tap types its word) and the books. Recent is
History's latest chapters: removing a recent place (its menu's Remove or
its swipe) takes that chapter's visits from History. Typed, the
reference, the books, then the documents by kind, each kind ordered open
in a pane, read (the latest first), coming with the app, in the reader's
language, the others; within those, titles the query begins, then those
whose words it begins, then those found by language or kind, by title
past a leading year and article ("1949/1964 Bible in Basic English" among
the B's). A query finds a document by a word's beginning, in any case, of
its title, short name, module name, its language's English or own name,
or a word for its kind; several words must each find it. A kind named
alone lists twelve in the reader's language, then its other languages as
rows that refine the query; a language named, five of each kind;
"languages", every language. Offline it lists only what is here, and says
"More is found when you're online." only where a query found nothing it
would have found online. Each document is a row of one model: its title,
a small line (a Bible's short name and what it is; a language not the
reader's), a check on what the page and the panel show, a ⓘ to its page
(Read, About, Details, License, where it is from, and, kept here and shown
in no pane, a link to remove it). A pick lands: a passage moves the page
(linked, the panel follows; from the panel's name, unlinked, the panel
alone); a Bible becomes the page's version, or is read in the panel; a
commentary is read in the panel where it fits (or picked for it), else on
the page; a dictionary or a book opens its own screens in Go To's sheet.
A document not on the device opens all the same (an arrival): the pane
keeps showing what it shows, named at once for the new document with a
hairline filling under its bar as it comes, and changes to it at the same
place once it can be read there (made, open, and its parts there read);
failed, its name is as it was and a toast says so. The panel sent one
while it showed none opens with "Opening…" in its place. Core checks the
catalog quietly at most once a day as Go To opens. The catalog's editions
of the bundled versions, and what this app can't read, are left out.

The reader and a plan's day use the same references and shared reading
rules. Marks are keyed by reference, so switching versions preserves their
meaning where the verse exists. Ribbons are named reading places; plans
track progress independently. Study and Practice share the language data.

The iOS app is a skin like the others: it runs core on core's host and
talks to it only in the line protocol, drawing both panes from `part`
lines and every screen from `screen` lines in UIKit. Feature availability
can depend on platform services and loaded datasets; sharing core does not
make platform integrations identical.

## Presentation and platform services

Use the platform's controls and interaction conventions. Reading text must
support selection and accessibility. Layout and appearance changes preserve
the reading position; motion respects the platform's reduced-motion setting.
Keep platform handles, network requests and view lifetimes in the skin.
Keep app rules, user-facing content and saved-data formats in core.

New screens should use the models in `core/ui.l8` and actions in
`core/skin.l8`. A new platform implements the [skin contract](SKINS.md),
including file I/O, data requests, events and any supported audio/sharing
services. The web's `web/main.l8` and terminal's `tui/main.l8` are concrete
host implementations.

## Boundaries

The bundled translations and study files are build inputs. User files are
local to each installation. The ESV uses the proxy's availability, rate and
cache rules. Audio may depend on a network or installed voices. Native
resources must be re-established when code is hot reloaded; only declared
persistent data transfers between module instances.

Build commands and source locations are in [README.md](README.md), web
behavior is in [WEB.md](WEB.md), and runtime reload contracts are in
[RELOAD.md](../../RELOAD.md). The source defines detailed screen IDs,
protocol fields, capacities and serialization formats.
