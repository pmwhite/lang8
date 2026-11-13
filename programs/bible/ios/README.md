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
  of the app's, the panel too: two matching pairs, the panel's button and
  Library, Listen and Reading, about a capsule naming the chapter (and,
  small under it, what the page reads), which never moves sideways. A tap
  on the capsule is Go To, a long press core's title menu (ribbons). Its
  shapes are in one glass container (`UIGlassContainerEffect`), so they
  merge and part as liquid does: reading on, the pairs melt into the
  capsule, which narrows to the chapter's name, and the status bar goes;
  moving back, a tap, a jump or a sheet brings them out again. It is in a
  window of its own above the app's, as large as the dock, so a touch
  beside it reaches what is under it; under a sheet of a task (Go To, the
  Library, Reading, Share) its glass dissolves along the sheet's
  transition and forms again as it goes.
- **The tray is the dock.** Verses selected, the capsule grows up into a
  glass panel of core's tray (the reference, the highlights' colors, Copy,
  Share, Bookmark, Note, Study, Compare, Memorize), and goes back into the
  capsule as they are let go.
- **At the top:** the way back after a jump, a glass capsule
  (`↩ Psalm 135`), and core's toasts dropping in where it is.
- **Core's screens are the system's.** Sheets of `UICollectionView` lists in
  the system's list layout, rows as content configurations with their
  accessories (switches, pop-up menus, sliders, time pickers, ⓘ), the
  system's search, content-unavailable view, context menus on a long press
  and swipe-to-delete. Reading's sheet leaves the page bright behind it,
  so a change is seen as it is made.
- **The panel** is a sheet over the page at a third, a half or the whole
  height, never dimming the page, UIKit's own in every way it moves. Its
  reader is the second pane under the system's bar (the chapter and what
  it reads, a tap Go To aimed at the panel; Link at its left, the menu at
  its right). The dock floats over its foot (the panel's safe area made
  larger there), and the page's reading area ends at its top.

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
| `panel.l8` | The panel's sheet and its reader |
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
place and chrome, the panel's sheet, the dock, and the screens), `!scroll
P DY`, `!flick P DY` (a finger's fling, frame by frame), `!dock
open|close`, `!tap WORDS` (the top sheet's first row so titled),
`!close`, `!back`, `!swipe` (the panel put away as a hand's swipe puts
it), `!probe N` (for N frames, where the dock and the panel's sheet are
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
- **The words' own menu:** Study (where core says the words have a word
  to study), Highlight and Note before the system's own.
- **Keys:** core's commands as key commands of the root's (the ⌘ overlay),
  and on an iPad the menu bar's Go menu and View's own commands.
- **The iPad:** the panel a column at the page's right where the window
  has room for both (the page keeping 28 em and its margins), a sheet
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
  capsule, the panel's bar) as a document comes.
