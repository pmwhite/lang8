# Smooth Bible

A Bible reader written in L8, with iPhone/iPad, Android, web and terminal
interfaces. It supports reading and search, highlights and notes, bookmarks,
ribbons, reading plans, version comparison, word study, Greek and Hebrew
learning, memorization and recorded or synthesized readings.

The BSB, KJV, WEB, ASV and YLT are bundled. The original Hebrew and Greek
and study data are in `data/`. The ESV requires the online proxy and is
available when the proxy reports that it can serve it. The Bookshelf
downloads further Bibles, commentaries, dictionaries, devotionals and
books from CrossWire's SWORD library and reads them with
[`programs/sword`](../sword/README.md).

## Build and run

Run these commands from the repository root:

```sh
make -j4 bible-web
node programs/bible/web/page/serve.mjs
# Open http://127.0.0.1:8470/read/

make -j4 bible-tui
.build/smooth-bible bsb

make -j4 .build/bible-ios.s .build/bible-ios-sim .build/bible-android.s
```

The web output is `.build/bible-site`. The local server uses the Worker for
routing and headers but does not supply the live ESV backend. The terminal
reads data from this checkout, or `SMOOTH_BIBLE_DATA`, and keeps user files
in `~/.local/share/smooth-bible`. Recordings use `ffplay` and speech uses
`spd-say` when installed. `SMOOTH_BIBLE_LOG=FILE` records its wire messages.

For iOS app bundles and an IPA:

```sh
tools/ios/build-linux.sh sim programs/bible/ios/app.l8 .build/bible-sim programs/bible/ios
tools/ios/build-linux.sh device programs/bible/ios/app.l8 .build/bible-device programs/bible/ios
```

The Linux bundle builder uses the L8 linker, compiled asset catalogs in
`ios/assets/`, and optionally `rcodesign` to seal the bundle. Without it, the linker's
executable signature remains. On a Mac, `tools/ios/build.sh`
can package assembly using Xcode. Android packaging uses the SDK, NDK and
JDK, without Gradle:

```sh
programs/bible/android/build.sh .build/SmoothBible.apk
```

These commands build artifacts; they do not run UI tests.

## Source layout

- `core/`: shared data, app state, persistence, screen models and actions.
- `ios/`: UIKit skin and platform services on core's host, including the native reader.
- `android/`: L8 host and Java skin using Android framework widgets.
- `web/main.l8`: shared core's WebAssembly host.
- `web/page/`: JavaScript skin, CSS, service worker, fonts, site builder and server.
- `tui/`: terminal host and skin.
- `worker/`: Cloudflare Worker, ESV proxy, D1 schema and site routing.
- `site/`: static home, contact and privacy pages and images.
- `data/`: translations, study data, plans, the user manual and verse timings.
- `tools/`: source-data converters, audio aligner and native wire utility.
- `demo/`: a local audio fixture (sine tones with known verse timings).

See [DESIGN.md](DESIGN.md) for the app's current architecture,
[SKINS.md](SKINS.md) for the platform contract, [WEB.md](WEB.md) for web
packaging and storage, and [the user manual](data/help.txt) for features.
[Hot reload](../../RELOAD.md) covers both browser and native development.

## Data and persistence

`core/text.l8` reads the translation records; `core/lang.l8` and
`core/orig.l8` read study and original-language records. The converters in
`tools/` document their input sources and binary formats. `tools/fetch.sh
DIR make` downloads the pinned sources, checks their hashes and regenerates
the data. `tools/align.py` builds verse timings from recordings; recordings
are streamed or downloaded by the app rather than committed to this repo.
`make bible-spoken VERSION=bsb` builds the aligner's spoken-text input.

Source attribution and license files are retained with the data. Changes
to datasets must preserve those notices and the app's acknowledgements.
ESV access and caching rules live in `worker/` and `core/esv_*.l8`.

`core/kept.l8` owns saved-file names and serialization. A skin supplies file
operations; the web uses browser storage. The Bookshelf keeps its own files
beside them (`core/shelf.l8`): `shelf.tsv` lists the modules installed or
waiting, `shelf-catalog.tar.gz` is the library's catalog as CrossWire
serves it, and `shelf-NAME.zip` is each module's package, read in place. Reading position, marks, notes,
plans and learning progress are local to each installation. There is no
cross-device synchronization.

Terminal replacement saves write a private temporary sibling, check completion
and close, then rename it over the saved file. A reported replacement failure
preserves the previous file. Saves do not use fsync, so the latest replacement
is not guaranteed to survive power loss. Append operations may leave an
incomplete appended suffix on failure. A save failure is reported to stderr
and remains in the terminal status bar for the session, taking priority over
transient success messages.

## Deployment and CI

`worker/wrangler.toml` serves `.build/bible-site` and routes `/api/` to the
ESV proxy. Build the site before deployment. A new deployment needs a
Crossway API key stored as the Worker's `ESV_KEY` secret, a D1 database
initialized with `worker/schema.sql`, and the configured domain and rate
limiter. Keep credentials outside the repository; deploy only when requested.

`.github/workflows/bible.yml` builds iOS and web artifacts for matching
changes on `trunk`, with the IPA also published to `ci-bible-ipa`.
`bible-assets.yml` compiles changed icons/colors on macOS into
`ci-bible-assets`; import those catalogs before building bundles locally.
The workflows contain the exact path filters and artifact names. There are
no Bible application, browser or simulator screenshot test suites.
