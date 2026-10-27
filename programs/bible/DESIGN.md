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
`core/shelf.l8` keeps the Bookshelf: SWORD modules downloaded on request
rather than bundled. A Bible among them becomes a version in a text slot of
its own, its records made from the module when it is opened; commentaries,
dictionaries and books are read from their packages while a screen shows
them.

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
