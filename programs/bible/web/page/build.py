#!/usr/bin/env python3
"""Build the web reader's site (WEB.md §W1.9) into SITE (.build/bible-site):

    python3 -I programs/bible/web/page/build.py SIZES APP_WASM SITE

The marketing pages (programs/bible/site/, without DESIGN.md) at the root,
and read/: the assets under hashed names (read.<hash>.css, bible.<hash>.js,
dom.<hash>.js, l8.<hash>.js, app.<hash>.wasm, icons.<hash>.svg, the fonts);
the data under data/<hash of it all>/: each version whole (<v>.gz), book
by book (<v>/<BOOK>.gz) and its sizes table (<v>.sizes.gz, made by SIZES,
tools/sizes.l8); the shell (shell.html), which the Worker answers every
reader's address with; and About (about.html). Then robots.txt, and
worker/boot_hash.js when the boot script changed. --check parses the pages
made: elements balanced, ids unique.
"""
import base64
import gzip
import hashlib
import html.parser
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
WEB = os.path.join(ROOT, "web")
DATA = os.path.join(ROOT, "programs", "bible", "data")
VERSIONS = ["bsb", "kjv", "web", "asv", "ylt"]
SITE_URL = "https://smoothbible.com"


def digest(data):
    return hashlib.sha256(data).hexdigest()[:10]


def put(where, name, ext, data):
    """data written into where as name.<hash>.ext: its name."""
    out = f"{name}.{digest(data)}.{ext}"
    with open(os.path.join(where, out), "wb") as f:
        f.write(data)
    return out


def text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


BOOT_HASH = os.path.join(ROOT, "programs", "bible", "worker", "boot_hash.js")


def boot_hash():
    """worker/boot_hash.js as it should be for web/page/boot.js."""
    with open(os.path.join(HERE, "boot.js"), "rb") as f:
        h = base64.b64encode(hashlib.sha256(f.read()).digest()).decode()
    return ("// The CSP hash of web/page/boot.js, inlined in every reader page (WEB.md\n"
            "// §W2.1a). Written by web/page/build.py; test.mjs checks it.\n"
            f'export const BOOT_HASH = "sha256-{h}";\n')


def build(sizes, wasm, site):
    if os.path.isdir(site):
        shutil.rmtree(site)
    shutil.copytree(os.path.join(ROOT, "programs", "bible", "site"), site, ignore=shutil.ignore_patterns("DESIGN.md"))
    read = os.path.join(site, "read")
    os.makedirs(os.path.join(read, "fonts"))
    css = text(os.path.join(HERE, "read.css"))
    for name in sorted(os.listdir(os.path.join(HERE, "fonts"))):
        src = os.path.join(HERE, "fonts", name)
        if name.endswith(".woff2"):
            hashed = put(os.path.join(read, "fonts"), name[:-6], "woff2", open(src, "rb").read())
            css = css.replace(f"fonts/{name}", f"fonts/{hashed}")
        else:
            shutil.copy(src, os.path.join(read, "fonts", name))

    # The data (WEB.md §W1.8): each version whole, book by book (exactly
    # its lines), and its sizes table, gzipped, under one directory named by
    # their hash, so every name is immutable.
    files = {}
    for v in VERSIONS:
        with open(os.path.join(DATA, v + ".txt"), "rb") as f:
            raw = f.read()
        files[f"{v}.gz"] = raw
        r = subprocess.run([sizes, os.path.join(DATA, v + ".txt")], capture_output=True)
        if r.returncode != 0:
            sys.exit("sizes failed: " + r.stderr.decode())
        files[f"{v}.sizes.gz"] = r.stdout
        starts = [i for i, line in enumerate(raw.split(b"\n")) if line.startswith(b"B")]
        lines = raw.split(b"\n")
        for k, at in enumerate(starts):
            end = starts[k + 1] if k + 1 < len(starts) else len(lines)
            files[f"{v}/{lines[at][1:4].decode()}.gz"] = b"\n".join(lines[at:end]).rstrip(b"\n") + b"\n"
    for name in ("refs.txt",):
        with open(os.path.join(DATA, name), "rb") as f:
            files["refs.gz"] = f.read()
    zipped = {n: gzip.compress(d, 9, mtime=0) for n, d in sorted(files.items())}
    dhash = digest(b"".join(n.encode() + z for n, z in zipped.items()))
    for n, z in zipped.items():
        p = os.path.join(read, "data", dhash, n)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(z)

    names = {"data": dhash}
    names["runtime"] = put(read, "l8", "js", open(os.path.join(WEB, "l8-runtime.js"), "rb").read())
    names["dom"] = put(read, "dom", "js", open(os.path.join(WEB, "dom.js"), "rb").read())
    names["wasm"] = put(read, "app", "wasm", open(wasm, "rb").read())
    names["icons"] = put(read, "icons", "svg", open(os.path.join(HERE, "icons.svg"), "rb").read())
    names["css"] = put(read, "read", "css", css.encode())
    js = text(os.path.join(HERE, "bible.js"))
    js = js.replace("../../../../web/l8-runtime.js", "./" + names["runtime"]).replace("../../../../web/dom.js", "./" + names["dom"])
    for k, n in names.items():
        js = js.replace("{{" + k + "}}", n)
    names["js"] = put(read, "bible", "js", js.encode())

    # The shell, which the Worker answers every reader's address with (its
    # head filled for the address), and About, the one page of its own.
    # (The boot script inlined byte for byte: the Worker's CSP names its hash.)
    boot = text(os.path.join(HERE, "boot.js"))
    page = text(os.path.join(HERE, "page.html")).replace("{{boot}}", boot)
    for k in ("css", "js", "dom", "runtime", "icons", "wasm", "data"):
        page = page.replace("{{" + k + "}}", names[k])

    def fill(fields):
        out = page
        for k, v in fields.items():
            out = out.replace("{{" + k + "}}", v)
        return out

    with open(os.path.join(read, "shell.html"), "w", encoding="utf-8") as f:
        f.write(fill({"title": "Smooth Bible", "og_title": "Smooth Bible", "bar_title": "Smooth Bible", "h1": "Smooth Bible",
                      "main": "<noscript><p class=\"note\">Smooth Bible needs JavaScript to show the Bible.</p></noscript>\n",
                      "credit": "Smooth Bible"}))
    with open(os.path.join(read, "about.html"), "w", encoding="utf-8") as f:
        f.write(fill({"title": "About · Smooth Bible", "og_title": "About · Smooth Bible", "bar_title": "About", "h1": "About Smooth Bible",
                      "main": text(os.path.join(HERE, "about.html")), "credit": "Smooth Bible"}))

    # (Nothing under /read/ is indexed: the Worker says noindex; /api/ is not
    # for crawlers. No sitemap.)
    with open(os.path.join(site, "robots.txt"), "w") as f:
        f.write("User-agent: *\nDisallow: /api/\n")
    hashed = boot_hash()
    with open(BOOT_HASH, encoding="utf-8") as f:
        kept = f.read()
    if kept != hashed:
        with open(BOOT_HASH, "w", encoding="utf-8") as f:
            f.write(hashed)
        print("worker/boot_hash.js rewritten: commit it")
    print(f"{len(zipped)} data files ({sum(len(z) for z in zipped.values()) // 1024} KB) in data/{dhash}")


VOID = {"meta", "link", "hr", "br", "img", "input", "use", "source", "wbr"}


class Checker(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.ids, self.hrefs, self.errors = [], set(), [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            if a["id"] in self.ids:
                self.errors.append("id twice: " + a["id"])
            self.ids.add(a["id"])
        if tag == "a" and a.get("href", "").startswith("/read/"):
            self.hrefs.append(a["href"])
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f"</{tag}> closes {self.stack[-1] if self.stack else 'nothing'}")
            if tag in self.stack:
                while self.stack.pop() != tag:
                    pass
        else:
            self.stack.pop()


def check(site):
    read = os.path.join(site, "read")
    bad = 0
    pages = 0
    links = set()
    for d, _, files in os.walk(read):
        for name in files:
            if not name.endswith(".html"):
                continue
            pages += 1
            path = os.path.join(d, name)
            c = Checker()
            c.feed(text(path))
            c.close()
            if c.stack:
                c.errors.append("left open: " + " ".join(c.stack))
            for e in c.errors[:3]:
                print(os.path.relpath(path, site) + ": " + e)
            bad += bool(c.errors)
            links.update(h.split("#")[0] for h in c.hrefs)
    missing = []
    print(f"{pages} pages, {bad} malformed, {len(links)} links, {len(missing)} to nothing")
    return bad == 0 and not missing


if __name__ == "__main__":
    if sys.argv[1:2] == ["--check"]:
        sys.exit(0 if check(sys.argv[2]) else 1)
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    build(*sys.argv[1:])
