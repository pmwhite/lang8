# smoothbible.com: design brief

The site is a quiet home for the app: one short page that says plainly what
Smooth Bible is and shows it, plus Contact, Privacy policy and a 404. It does
not try to persuade. Build exactly what is below, in one pass, by editing the
existing files in this directory (`index.html`, `contact/index.html`,
`privacy/index.html`, `404.html`, `style.css`, `img/`). Every visible word on
the site is given here; add none.

## Rules that hold everywhere

- Third person, plain and factual. No I, we, our, you or your in the copy.
- No taglines, slogans, bold text, bolded labels, punchy fragments,
  exclamation marks, emoji or icons other than the app icon.
- Nothing about App Store availability: no "coming soon", no TestFlight, no
  badge, no button, no availability line.
- No implementation details: no sources or licences, no servers, API or
  limits, no iOS version.
- Privacy is not mentioned on the home page except as the footer link.
- System fonts only. No web fonts, no scripts, no external requests, no
  analytics. The only files the pages load are `style.css` and `img/*`.
- Follows the visitor's light or dark setting (`prefers-color-scheme`);
  there is no toggle.

## Before building: keep this file off the site

`site/` is served as static assets, so this file would appear at
`/DESIGN.md`. Create `site/.assetsignore` containing one line:

```
DESIGN.md
```

## Images

### Screenshots

Use the clean store shots from branch `ci-bible-shots` (1320×2868, status
bar 9:41). Do not use the numbered demo shots: they carry a real clock, a
different device size and debugging states.

```
mkdir -p /tmp/sb && cd /home/philip/src/lang8-bible
git fetch origin ci-bible-shots
for n in 1 3 5 7 6; do git show origin/ci-bible-shots:store-$n.png > /tmp/sb/store-$n.png; done
cd programs/bible/site/img
convert /tmp/sb/store-1.png -resize 660x -strip -quality 82 reading.jpg
convert /tmp/sb/store-3.png -resize 660x -strip -quality 82 highlights.jpg
convert /tmp/sb/store-5.png -resize 660x -strip -quality 82 word.jpg
convert /tmp/sb/store-7.png -resize 660x -strip -quality 82 compare.jpg
convert /tmp/sb/store-6.png -resize 660x -strip -quality 82 settings.jpg
git rm shot-1.jpg shot-2.jpg shot-3.jpg shot-5.jpg shot-7.jpg
```

Each result is 660×1434. No crop: the whole screen, status bar included, as
the simulator drew it (store-5 and store-7 have a dimmed status bar because a
full sheet is open; that is how the phone looks, leave it). No device frame,
no shadow, no added text.

Order, file, subject, caption (the caption is the visible text under the
picture; the alt text is for screen readers):

| # | File | Source | Caption | alt |
|---|------|--------|---------|-----|
| 1 | `reading.jpg` | store-1 | Genesis 1 | The first chapter of Genesis in the reader |
| 2 | `highlights.jpg` | store-3 | Highlights in John 3 | John 3 with verses 14 and 15 highlighted in green and verses 16 and 17 in yellow |
| 3 | `word.jpg` | store-5 | A Greek word in John 3:16 | The word page for ēgapēsen, “loved”, in John 3:16, with its dictionary form, meaning, grammar and concordance |
| 4 | `compare.jpg` | store-7 | John 3:16 in several versions | John 3:16 in the Berean Standard Bible, the English Standard Version, the King James Version and the World English Bible |
| 5 | `settings.jpg` | store-6 | Reading settings | The Reading sheet with the version, Listen, text size and themes |

Notes are named in the text but not pictured: the only shots showing a note
are demo shots with a keyboard up and a real clock. If a clean store shot of a
note is added to `ci-bible-shots` later, it can replace `highlights.jpg` with
the caption "A note on John 3:5".

### Icon and favicons

Keep `img/icon.png` (360×360), `img/apple-touch-icon.png` (180×180) and
`img/favicon.png` (64×64) as they are. The icon is shown with
`border-radius: 22.5%` and no shadow.

## Colours

The app's own colours (`ios/Colors/*.colorset`). Keep the custom properties in
`style.css` and their values:

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--paper` | `#FBF8F2` | `#1B1A18` | page background |
| `--ink` | `#1E1C19` | `#E6E1D7` | body text, h1 |
| `--heading` | `#4F4943` | `#BDB6AA` | h2, the home link on inner pages |
| `--faint` | `#8A8378` | `#8C857A` | captions, footer links, date |
| `--accent` | `#9C3A2C` | `#DC8873` | links in running text |
| `--rule` | `rgba(30,28,25,0.12)` | `rgba(255,255,255,0.12)` | footer rule, screenshot outline |

`color-scheme: light dark` on `:root`. The screenshots are light in both
modes; do not filter or dim them in dark mode.

## Typography

- Text: `"New York", ui-serif, Charter, "Iowan Old Style", Georgia, serif`,
  18px, line-height 1.6. (The app reads in a serif; the site does too.)
- Interface: `-apple-system, system-ui, "Segoe UI", Roboto, sans-serif` for
  the home link, footer, captions, h2 and the privacy date.
- h1: serif, 2rem (32px), weight 600, line-height 1.2.
- h2 (privacy page only): sans, 15px, weight 600, `--heading`.
- Captions: sans, 14px, `--faint`, centred, line-height 1.35.
- Footer: sans, 14px.
- Links: `--accent`, no underline; underline on hover. Footer and home links
  use their own colours (below).
- Curly quotes and apostrophes throughout (’ “ ”), as in the copy below.

## Layout and spacing

- Text column: `max-width: 36rem; margin: 0 auto; padding: 0 1.5rem`. Used by
  `header`, `main`, `nav`, `footer`.
- Paragraph spacing: `margin: 0 0 1rem`.
- No top nav on the home page (the icon and name are the header). Inner pages
  (contact, privacy, 404) have a nav line at the top holding only the home
  link; there is no Contact link in the nav, since the footer has it.
- Footer on every page, identical.

### Home page, top to bottom

1. **Header** (`<header class="intro">`), `margin-top: 4rem` (64px):
   icon 80×80 to the left, `h1` "Smooth Bible" to its right, vertically
   centred, gap 1.25rem. Nothing else in the header.
2. **Text** (`<main>`), `margin-top: 2rem`: the two paragraphs below.
3. **Screenshots** (`<div class="shots">`), `margin-top: 2.5rem`: five
   `<figure>`s, each an `<img>` and a `<figcaption>`.
4. **Footer**.

### Screenshots: phone and desktop

Each figure: `margin: 0; flex: none`. The `img` has `width`/`height`
attributes 660/1434, `display: block; height: auto`, `border: 1px solid
var(--rule)`, and a corner radius of 14% of its width (the phone's own
corner). Caption `margin-top: 0.6rem`. Images 3 to 5 get `loading="lazy"`.

- Narrow (below 1100px): one row that scrolls sideways.
  `display: flex; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory;
  padding: 0 1.5rem 0.5rem; scroll-padding: 0 1.5rem`. Figures are 220px wide
  (`scroll-snap-align: start`), images `border-radius: 31px`. The first
  picture's left edge lines up with the text column's left edge on a phone;
  on a tablet the row is centred with `justify-content: safe center`. No
  arrows, dots or scrollbar styling.
- Wide (1100px and up): no scrolling; the five sit in one centred row,
  figures 192px wide, gap 1.5rem (row width 1056px), images
  `border-radius: 27px`.

### Inner pages

Nav: `padding-top: 1.25rem`, holding `<a class="home" href="/">` with the
favicon at 24×24 (`border-radius: 22.5%`) then "Smooth Bible", sans 15px,
weight 600, colour `--ink`, gap 0.5rem. Then `main` with `h1`
(`margin: 3rem 0 1rem`) and the text.

### Footer

`margin-top: 4rem; padding: 1.25rem 1.5rem 2.5rem; border-top: 1px solid
var(--rule)` on the column (the rule spans the 36rem column, not the window).
Two links, "Contact" and "Privacy policy", colour `--faint`, 1.25rem apart.
Nothing else: no copyright line, no year.

## Copy

### Home (`/index.html`)

h1:

> Smooth Bible

Paragraph 1:

> Smooth Bible is a free Bible reader for iPhone. The text runs in one
> continuous scroll from Genesis to Revelation, with poetry set in lines,
> section headings and footnotes. The Berean Standard Bible, the King James
> Version, the World English Bible, the American Standard Version and Young’s
> Literal Translation are included, and the English Standard Version can be
> read online. The page can be set in different themes, typefaces and sizes,
> and the app can read the text aloud.

Paragraph 2:

> Verses can be highlighted in colour, bookmarked and given notes, and any
> verse can be compared across the versions. For study, the Hebrew and Greek
> words are shown under each verse, and each word has a page with its meanings
> and grammar in plain English and the other places it is used. Cross
> references, Matthew Henry’s Concise Commentary and reading plans are also
> included.

Captions: as in the screenshot table.

Footer: Contact · Privacy policy (two links; the middle dot is not text, it
is the gap).

That is every word on the home page. There is no "Features" heading, no list
and no contact paragraph.

### Contact (`/contact/`)

h1:

> Contact

Paragraph:

> Questions and suggestions about Smooth Bible can be sent to
> contact@smoothbible.com.

(The address is a `mailto:` link.) Nothing else.

### Privacy policy (`/privacy/`)

h1:

> Privacy policy

Date line (sans, 14px, `--faint`, `margin-top: -0.5rem`), then the policy's
sections as h2s: Information, Sharing, Keeping and deleting, Changes, Contact
(the address a `mailto:` link). The page itself holds the wording.

The policy is deliberately broad (owner, 2026-10-20): it promises little,
so that accounts, syncing or other features can come without taking a
promise back; it is made more specific over time, never the other way. It
names no features, servers or absences (no "no accounts", "not logged",
"no cookies"), but stays true of what the app and site do, as App Review's
guideline 5.1.1 asks: what is collected, how it is used and shared, how
long it is kept, and how to ask for it to be deleted.

### 404 (`/404.html`)

h1:

> Page not found

Paragraph:

> There is nothing at this address. The home page is at smoothbible.com.

Make "smoothbible.com" the link to `/`.

## Head and meta

Every page:

```
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#FBF8F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1B1A18" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/img/favicon.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="stylesheet" href="/style.css">
```

`<html lang="en">`.

| Page | `<title>` | `description` |
|------|-----------|---------------|
| Home | Smooth Bible | Smooth Bible is a free Bible reader for iPhone, with the Berean Standard Bible and other versions, highlights and notes, and Hebrew and Greek word study. |
| Contact | Contact · Smooth Bible | How to contact Smooth Bible. |
| Privacy | Privacy policy · Smooth Bible | The privacy policy for the Smooth Bible app and smoothbible.com. |
| 404 | Page not found · Smooth Bible | Page not found. |

Home only, for link previews:

```
<link rel="canonical" href="https://smoothbible.com/">
<meta property="og:type" content="website">
<meta property="og:url" content="https://smoothbible.com/">
<meta property="og:title" content="Smooth Bible">
<meta property="og:description" content="(the same text as description)">
<meta property="og:image" content="https://smoothbible.com/img/icon.png">
<meta name="twitter:card" content="summary">
```

No other meta, no manifest, no structured data.

## Acceptance checks

Preview: `cd programs/bible/worker && npx wrangler dev --local --port 8793`;
stop it afterwards by its PID (`lsof -ti :8793`), not by `pkill -f`.

Screenshot each of `/`, `/contact/`, `/privacy/` and `/nothing-here` at these
sizes, in light and in dark (`--force-dark-mode
--blink-settings=preferredColorScheme=0`), and look at every picture:

```
chromium --headless=new --disable-gpu --hide-scrollbars --window-size=390,1400 --screenshot=/tmp/x.png http://localhost:8793/
```

Sizes: 390×1400 (phone), 820×1180 (tablet), 1280×900 and 1440×900
(desktop). For the full home page on desktop, also 1280×1300.

Must hold:

- Home at 1280 and 1440: header, both paragraphs and all five screenshots
  with captions in one row, none cut off, row centred under the text column;
  the whole page (footer included) fits in 1300px of height.
- Home at 390: the first screenshot's left edge lines up with the paragraph
  text; the next one peeks in at the right edge; the row scrolls sideways and
  the page itself does not scroll sideways (no horizontal page overflow at
  any size).
- Screenshot order is Genesis 1, Highlights in John 3, A Greek word in
  John 3:16, John 3:16 in several versions, Reading settings; each picture
  is the full screen with rounded corners and a hairline outline, and is not
  stretched (aspect 660:1434).
- Dark: page background `#1B1A18`, text light, links `#DC8873`, the
  screenshots unchanged and outlined.
- 404 returns the 404 page (status 404) and its link goes home.
- Inner pages show the home link at the top and the same footer; the home
  page has no nav line.

Must not appear (check with grep over `site/*.html site/*/*.html` and by eye):

- the words: coming soon, App Store, TestFlight, download, iOS, API, licence,
  license, server, privacy (except the footer link and the privacy page
  itself), Features, verse of the day;
- I, we, our, us, you, your as whole words in visible copy (grep with `-w`;
  "Young’s" and "used" are fine);
- `<b>`, `<strong>`, `<ul>`, `<script>`, `@font-face`, `@import`, any
  `http` URL other than the canonical and og tags;
- the old images `shot-*.jpg`.

Size budget: the five JPEGs together under 600 KB; HTML and CSS together
under 12 KB.
