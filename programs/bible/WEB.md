# Smooth Bible on the web

The browser runs shared L8 core as WebAssembly. `web/main.l8` supplies file,
network and storage primitives; `web/page/skin.js` draws the reader and core's
screens using HTML, CSS and browser APIs. It uses `web/l8-runtime.js` and
`web/reload.js` from the repository root. The interface to core is the
line-based [skin protocol](SKINS.md).

## Build and serve

From the repository root:

```sh
make -j4 bible-web
node programs/bible/web/page/serve.mjs
```

The server defaults to port 8470 and serves `.build/bible-site` using the
Worker's routing and headers. `web/page/build.py` hashes UI assets, gzips
the datasets and generates the shell, About page, manifest and service
worker. Make caches compressed translation files in `.build/bible-data`.
The Worker fills the shell's head for reader URLs such as
`/read/bsb/john/3`; `worker/books.js` contains URL book names.

The build also copies `site/` into the site's root. These are static
marketing, contact and privacy pages, with local images and styles.
Markdown documentation is excluded from the published site.

## Browser behavior

The reader is the page. Core's screens open beside it on wide windows and
over it on narrow ones. Browser history supports navigation and Back;
verse selection opens the action toolbar. Audio, speech, wake lock and
storage use the browser's services where available.

Saved files from `core/kept.l8` use `sb.NAME` keys in browser storage. There
is no server account or cross-device synchronization. Export is the way to
take saved information out of an installation.

The service worker caches the shell and data files as they are loaded.
Offline use requires a prior visit and the relevant data to have been
cached. API responses and recordings are not part of that offline cache.

Downloads (recordings, and the Bookshelf's catalog and modules) come
through the Worker's `/api/v1/relay?u=ADDRESS`, because their hosts don't
allow pages to read their files. The Worker relays only the addresses its
`RELAYED` rules allow. The page keeps each download in the browser's
`sb-held` cache under `/read/held/NAME` and reads it back for core by name.
The manifest supports installation where the browser offers it.

## Development and deployment

For core reloads, run `node web/dev.mjs -- --async bw_wait
programs/bible/web/main.l8 -o .build/dev/bible.wasm` from the repository
root. Serve the site with `SB_DEV=1 node programs/bible/web/page/serve.mjs`
and open `/read/?dev=http://127.0.0.1:8777`. See
[RELOAD.md](../../RELOAD.md) for state transfer and host lifetimes.

`worker/wrangler.toml` points at `.build/bible-site`; deployment requires a
completed build and the proxy's configured services. The local server does
not supply the live ESV backend. Deployment details and CI artifact paths
are in [README.md](README.md). No browser or screenshot test suite is retained.
