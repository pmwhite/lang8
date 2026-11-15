# Vellum: the iPhone and iPad skin

Vellum is Smooth Bible's iPhone and iPad skin, written for iOS 26 from
the ground up. Like every skin it runs core on core's host and speaks
only the line protocol ([SKINS.md](../SKINS.md)). Its kept files are in
Application Support/SmoothBible. This directory also holds the app's
bundle: `Info.plist`, `PrivacyInfo.xcprivacy`, the icons, `Colors/` and
the compiled asset catalog (`assets/`), the frameworks it links
(`frameworks`) and the data files it carries (`resources`).

## How it looks and moves

- **The page is the screen.** The words run edge to edge under the status
  bar, which softens them (the scroll view's top edge effect). There is no
  bar at the top.
- **The dock.** Liquid Glass at the foot, near the thumb, over everything
  of the app's, the panel too: two matching circles, the panel's button
  and ⋯ (the Library, Listen, Reading), about a capsule naming the
  chapter (and, small under it, what the page reads). A tap on the
  capsule is Go To, a long press core's title menu (ribbons). Its shapes
  are in one glass container (`UIGlassContainerEffect`), so they merge
  and part as liquid does: reading on, the circles melt into the
  capsule, which narrows to the chapter's name, and the status bar goes;
  moving back, a tap, a jump or a sheet brings them out again. Under a
  finger, as Safari's bar does, the change follows the finger (a paused
  `UIViewPropertyAnimator`, as far through as the finger has read of 60
  points, either pane's), and as the finger lifts it finishes from where
  it is if most of the way or thrown that way, else goes back; thrown, it
  changes in a spring once read far enough. It is in a
  window of its own above the app's, as large as the dock, so a touch
  beside it reaches what is under it (the screen's size while one of its
  menus shows, as a window draws nothing past itself; what its menus
  choose goes to the window's root, up the responder chain); under a sheet of a task (Go To, the
  Library, Reading, Share) its glass dissolves along the sheet's
  transition and forms again as it goes.
- **Go To rises from the dock.** A tap on the capsule brings the keys up
  at once: the capsule's own glass (handed from the dock to Go To's
  overlay, a view in the app's window, not a presented controller) rises
  with them into the field, the close parting from it as liquid, the
  chapter's name dissolving into the field's words, the rest of the dock
  dissolving and the page blurred behind; Go To is asked of core on the
  next turn, so the keys wait on nothing, and its rows form as they come.
  Closed, the field sinks back into the capsule. Above the field, nearest first,
  all of Go To on one shape of glass, made to fit the room above the keys
  so that nothing scrolls: the ribbons and the plan's day a row each (a
  ribbon's strip in its color, its place at its right), Recent and the
  documents a line each (its name in a column at its left, its places
  plain words after it, the one read in the accent, as many as fit
  whole), and at the top its ways to more, quiet buttons: Books, History,
  Plans, Browse. Typed, what the words find are rows under their headers
  (All 77 at a header's right); what doesn't fit is a last line, More, of
  links to the whole lists (made for the keys' height as last seen, and
  again when they rise to another). While the words name books, the
  books as chips and the chosen one's chapters as a grid (the one read
  last ringed). A chapter's tap goes there; held, the grid grows into the
  chapter's verses, and a finger slid to one and lifted goes there.
  Return goes to the ringed chapter or the washed row. The field, its
  close, the book chips and the grid are the other glass.
- **Deeper, still in Go To.** A screen Go To opens (Books of the Bible,
  a grid of their names, then a book's chapters; History; Plans; Browse;
  a document's page; every verse found) fills the room above the field
  on Go To's glass, the keys down and the field's words kept: the lists
  of the app's own navigation, a child of the overlay's controller. Its
  glass grows with a spring out of Go To's panel's place and shape (the
  panel's words fading over it, the lists fading in) as the keys fall,
  and goes back into it as they rise, the panel's own glass taking its
  place where it ends. Back (‹) is the screen before, from the first Go
  To again; a tap on the
  field is Go To again too, the keys up; the close closes Go To from
  anywhere, and a place picked anywhere goes there.
- **Go To's colors are the theme's.** Its glass (the field, its close,
  the chips, the grid, its shapes) is tinted with the page's color, as
  the dock's is, and the page under it blurs washed in its own color, so
  that Paper and Sepia are warm, Dark and Black dark, never grey. Rows on
  its glass are a faint wash of the ink, a page's or a plain list's none;
  words are the theme's ink and faint, the one read and Return's in its
  accent.
- **The tray is the dock.** Verses selected, in either half of a split,
  the capsule grows up into a glass panel of core's tray (the reference,
  the highlights' colors, Copy, Share, Bookmark, Note, Study, Compare,
  Memorize), and goes back into the capsule as they are let go.
- **At the top:** the way back after a jump, a glass capsule
  (`↩ Psalm 135`), and core's toasts dropping in where it is.
- **Core's screens are the system's.** Sheets of `UICollectionView` lists in
  the system's list layout, rows as content configurations with their
  accessories (switches, pop-up menus, sliders, time pickers, ⓘ), the
  system's search, content-unavailable view, context menus on a long press
  and swipe-to-delete. Reading's sheet leaves the page bright behind it,
  so a change is seen as it is made.
- **The panel** is under the page in a split: the page above, the panel
  below, parted by the divider, a band with glass buttons on it (the
  halves' corners at it rounded, as two cards side by side),
  the split's (the dock's panel button: as the panel comes it goes up out
  of the dock into the divider, and back down into it as the panel goes;
  a tap closes the split) and the link (🔗, in the accent linked, faint
  unlinked, none for a document read in its own divisions, a book or a
  dictionary, which can't be linked; a tap links or unlinks) and, as far
  in from the right as the split's from the left, Swap Panes (⇅, where
  core's menu has it, each pane's picture over it until it is laid out
  with what the other read). While the divider moves, by a hand or
  settling, the linked panes aren't followed; once it is still, they
  are.
  The halves of a split are alike, the panel's type and ground the
  page's, one above the other or (an iPad's) side by side.
  A drag of the divider sizes the two, settling at a third, a half or
  two thirds of the window (the height kept on the device); thrown to
  the top, the
  panel fills the screen (core's Full Screen), let go down by the dock,
  the split closes. Opening and closing are each one spring (from a tap,
  or as the divider is let go): the button flies between the dock and
  the divider as the dock's other shapes close in or part. Its reader is the second pane, with no bar of its
  own: while it shows, the dock is the header of both readers, as
  symmetrical as the page's alone: the page's capsule (its chapter, the
  version) at the left, ⋯ in the middle and the panel's capsule (where it
  is over what it reads, as the page's: the place large, the document
  small) at the right; a scroll of either pane by a hand draws the dock
  in or out. As the panel comes the dock moves
  over by a place, the page's capsule over where the panel's button was,
  ⋯ to the middle, the panel's capsule growing out of where ⋯ was; as it
  goes, back. The words that change go as the shapes begin to move and
  the new come as they settle. The panel's capsule's tap is Go To aimed
  at the panel, its field rising out of that capsule (unlinked, a passage
  picked moves the panel alone, and the field says so); its long press,
  the panel's ribbons at its place, as the page's capsule's are the
  page's (`titlemenu 1`; Swap Panes and Close Panel are the divider's),
  each a context menu, the capsule lifted beside it so that letting go
  chooses nothing. Drawn in, the dock shows both
  capsules, each its place alone. Study pushed over the
  reader has the system's bar and its Back. In an iPad's wide window the
  panel is a column at the page's right with its own bar. The dock floats
  over the panel's foot (its safe area made larger there), and the page's
  reading area ends at the divider.
- **Side by side** in a window wider than tall (a phone on its side): the
  page at the left, the panel at the right, each a column from the safe
  area at its side to the divider standing between them. Alone, the dock
  is ⋯, the capsule, then the panel's button at the right end, where the
  panel comes from: opening, the button slides along the dock's row to
  the divider's foot (it stays the dock's, in the row), the panel comes
  in from the right, the page's capsule goes to the middle of its half,
  the panel's grows out of the button to the middle of its own, and ⋯
  rises onto the divider over the button (the divider's own at rest);
  Swap Panes (⇄) is at the divider's head, Link in its middle. Dragged
  sideways (by the divider or the panel's button) the halves' edges and
  the capsules follow; it settles at a third, a half or two thirds of the
  width (the share kept is the one stacked uses), thrown to the left the
  panel fills the screen, thrown to the right the split closes. The
  halves' words are laid out only at the widths the split settles at: a
  spring's at once at those it goes to (a margin that moves gliding in
  it), a hand's at those it would settle at from where it is, so that
  letting go lays out nothing more. Laid out
  again at a new width, a pane keeps its rows' words and measures anew the
  one at its reading line and those in sight, those out of sight as they
  come near; a row's verses' places are found as they are asked for.
  Turned with the split open, it goes between stacked and side by side.

## How it is built

| File | What it holds |
|---|---|
| `app.l8` | The app's delegate and scene, the root, core's lines dispatched (`said`), animations by kind, hot reload |
| `kit.l8` | UIKit from L8: message shapes, geometry, colors, fonts, symbols, glass, springs, timers, haptics |
| `link.l8` | Lines to core and core's lines read; asking for a part or a model and taking its answer |
| `platform.l8` | Core's host given the phone: bundle data, kept files, GET, fetches, kept reads and writes, the network's kind |
| `look.l8` | Core's look, highlights and themes; each pane's type set and every style's attributes |
| `part.l8` | A part decoded into an arena of its own; its attributed words, marks and washes |
| `pane.l8` | A pane: a scroll view of measured parts on a tall canvas; places, jumps, telling core, taps |
| `linking.l8` | Link maps, chapter shapes (laid out or guessed by bytes), following |
| `dock.l8` | The dock and its window, the tray, the way back, toasts, the title's menu |
| `screens.l8` | Core's screens as sheets of lists; effects; rows, menus and swipes |
| `goto.l8` | Go To's quick form over the keys: its field, its rows and its passage chooser |
| `panel.l8` | The panel: the split (its divider) or the column, and its reader |
| `services.l8` | Core's time, the screen kept on, the pasteboard, sharing, pages outside |
| `devwire.l8` | The development server's data files and lines |

A pane's parts sit on a canvas of 400,000 points about its middle: a part
coming in above is placed above the first, so nothing in sight moves and
the offset is never touched while a finger or a fling moves it; at rest,
far from the middle, the canvas is moved back under what is read in one
unseen frame. The document's first and last parts, once in the window,
bound the scroll by the content's insets. Following uses
`core/follow.l8`'s rules, with sections not laid out yet guessed by their
bytes (`sizes`) as SKINS.md says. The follower doesn't glide: it is put at
the rule's place at once, cross-faded, every quarter second while the
leader moves and as soon as it rests, its window made anew where that is
more than a screen past what it has laid out, so that following looks the
same near or far.

## Running it

It needs iOS 26. With the hot reload host on the phone (RELOAD.md),
serve it:

```sh
node web/dev.mjs --port 8777 --data .build/bible-folio -- programs/bible/ios/app.l8 -o .build/dev/bible-ios.wasm
```

The development wire takes core's lines (`node web/devctl.mjs wire tap
goto`, lines split by `|`) and the skin's own: `!state` (each pane's window,
place and chrome, the panel, the dock, and the screens), `!scroll
P DY`, `!flick P DY` (a finger's fling, frame by frame), `!dock
open|close`, `!tap WORDS` (the top sheet's first row so titled, or the quick form's row),
`!close`, `!back`, `!pull P DY` (pane P dragged by DY with a finger held
on it, and let go), `!split P` (the split's divider let go as a hand
would at P% of the window's height, or width side by side: 0 closes it,
100 fills the screen), `!drag P` (the divider dragged as a hand would,
frame by frame for half a second, to P%, and let go: each frame's layout
time written to the log), `!panel` (a tap on the dock's panel button),
`!tapat X Y` (a finger's tap on the words at window point X, Y), `!capsule` (a tap on the dock's capsule), `!panelcapsule` (on the panel's), `!link` (Linked, in the panel's menu), `!shot` (every window of the app's, the dock's too, drawn to the server's /shot: its glass left out), `!slow F` (every window's animations F times slower), `!dockinapp 1` (the dock moved into the app's window, so that ReplayKit records it; a sheet presented after goes over it; `!dockinapp 0` back), `!home` (Back from the first screen Go To opened), `!theme N` (theme N chosen, the one it was logged), in Go To's quick form `!type WORDS`, `!return`
and `!hold N V` (chapter N held, the finger on verse V; `!hold 0` lets
go), `!probe N` (for N frames, where the dock and the panel are
drawn), `!part` (the panel's first part as core sent it: its words and
styles), `!sheetviews` (the sheet's views, from the panel's up), and `!record
on|off` (ReplayKit; the movie is posted to the server's `/video`, for
checking animations frame by frame).

`make .build/bible-ios.s .build/bible-ios-sim` builds it for a device and
the simulator (both are part of `make check`); `tools/ios/build-linux.sh
device programs/bible/ios/app.l8 OUT programs/bible/ios` makes the app
bundle (../README.md), as CI does for TestFlight.

## What else it does

- **Listen.** The device's voice and recordings (AVFoundation), the lock
  screen's controls and what it shows, interruptions and headphones; the
  player is a glass pill that rises out of the dock, in its container, its
  name a tap to the verse heard.
- **Reminders** (UserNotifications), a reminder opened telling core.
- **Share as Image:** core's composer, the card drawn at its pixels by
  core's measures, shared whole.
- **The words' own menu:** on the page, Study (where core says the words
  have a word to study), Highlight and Note; in either pane, Look Up (the
  words to core, `lookup`, a dictionary read at their entry); then the
  system's own.
- **Keys:** core's commands as key commands of the root's (the ⌘ overlay),
  and on an iPad the menu bar's Go menu and View's own commands.
- **The iPad:** the panel a column at the page's right where the window
  has room for both (the page keeping 28 em and its margins), a split
  otherwise, moving between them as the window changes size.
- **Core's own rows:** the text's size, the themes' swatches, the ribbons'
  colors, a download's ring, verses found, marks, passages, verses, the
  share card, the interlinear's tiles (right to left for Hebrew; large and
  centred for an exercise), a lemma's forms; a plan's day's circle, a
  letter's glyph, words at a row's end, a row's actions as a menu, a
  study's hero word and a screen's intro, a section's header button and
  credit, an index down the side, the Library's filter and sort.
- **Practice** takes typed letters (the list is a key input: no capitals,
  no corrections), a wrong one felt.
- **Arrivals:** a hairline along the foot of the pane's bar (the page's
  capsule; the panel's capsule, or its bar in a column) as a document
  comes.
