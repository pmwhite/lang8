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
`core/beside.l8` keeps the panel beside the page: what is read with the
Bible (the Bookshelf, the document read beside the page, Study) as a stack
of screens of its own, kept while sheets come and go and opened again as
it was left. Its document is a version or a Bookshelf module; a version or a
commentary there follows the page. Where the skin draws a reader in the
panel, a version or a commentary is read there as the page is, every
chapter in turn (a commentary's comments laid out as a chapter, each a
verse of its own, by core/shelf_folio.l8). The iPhone reads a commentary
a part at a time: about 2 KB of its records from one of its folio's marks
(where a comment, a verse or a paragraph begins), so that core lays out
only the parts near the screen, whatever a chapter's length; the folio's
marks say which part each verse is in without decoding the others. The
panel shows a window of parts, each measured as it comes in (its height,
and where each of its verses begins), so that where anything shown is is
known, never estimated; parts come in ahead of the screen and go far
behind it, one coming in above moving the panel by its height at once.
Linked with the page (a button at its foot), the two move together,
whichever a hand moves leading; unlinked, neither moves the other, and
linked again it comes to the page's place (elsewhere, a version is a page
of paragraphs, a chapter at a time). Each side is read at one line: the
page's a third of the way down (where Go To leaves a verse), the panel's
at its top. A version follows verse by verse, as far through each as the
leader is. A commentary follows by comment: the follower moves only when
the leader comes to a verse its comment isn't on, to the nearest comment
on it (a jump goes to its first); near, it glides, far, it is there at
once. While the page glides after a flick, no one reads it: the
commentary waits, and settles at the page's verse when the page stops.
`core/shelf.l8` keeps the Bookshelf: SWORD modules downloaded on request
rather than bundled. A module is made as part of its download: a Bible
becomes a version in a text slot of its own, and a commentary, dictionary
or book a folio (`programs/folio`), read a chapter, an entry or a part at a
time while a screen shows it. Until it is made it shows as downloading,
one bar for fetching and making, and it is said ready to read once it is
made, so opening it reads only the folio's head. Modules downloaded while
another is being made wait their turn. Making happens a step at a time
between the screen's updates (core asks the skin for a turn with `next`),
so the app keeps answering its reader however slowly it runs, as it does
interpreted under hot reload.
Go To and the Bookshelf list what can be read in one way
(`core/shelf_screens.l8`'s documents): the bundled versions, the original
languages, the ESV and the Bookshelf's modules. Each pane's lists read into that pane:
over the reader, a Bible chosen becomes the reader's version (Read Beside
reads it in the panel) and any other is read beside the page where the
panel fits; in the panel, anything chosen is read there.
The Bookshelf is one screen, the panel's first: by kind, what is on the
device, then the catalog, whose rows download on a tap and show their
progress in place. It leaves out the catalog's editions of the bundled
versions.

The reader and a plan's day use the same references and shared reading
rules. Marks are keyed by reference, so switching versions preserves their
meaning where the verse exists. Ribbons are named reading places; plans
track progress independently. Study and Practice share the language data.

The iOS app is a skin like the others: it runs core on core's host and
talks to it only in the line protocol, drawing the reader from `chapter`
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
