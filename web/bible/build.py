#!/usr/bin/env python3
"""Build the web reader's site (WEB.md §W1.9) into SITE (.build/bible-site):

    python3 -I web/bible/build.py PRERENDER APP_WASM SITE

The marketing pages (programs/bible/site/) at the root, and read/: the
assets under hashed names (read.<hash>.css, bible.<hash>.js, dom.<hash>.js,
l8.<hash>.js, app.<hash>.wasm, icons.<hash>.svg), the versions' texts
gzipped (data/<name>.<hash>.gz), the fonts, the page template with those
names and the boot script in, and the pages PRERENDER makes from it (every
chapter, the book indexes, About, the shell). Then robots.txt, sitemap.xml,
and headers.txt: the boot script's CSP hash and the cache rules, for the
Worker. --check parses every page made: elements balanced, ids unique, and
every link under /read/ to a page that exists.
"""
import base64
import gzip
import hashlib
import html.parser
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "web")
HERE = os.path.join(WEB, "bible")
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
    """worker/boot_hash.js as it should be for web/bible/boot.js."""
    with open(os.path.join(HERE, "boot.js"), "rb") as f:
        h = base64.b64encode(hashlib.sha256(f.read()).digest()).decode()
    return ("// The CSP hash of web/bible/boot.js, inlined in every reader page (WEB.md\n"
            "// §W2.1a). Written by web/bible/build.py; test.mjs checks it.\n"
            f'export const BOOT_HASH = "sha256-{h}";\n')


def build(prerender, wasm, site):
    if os.path.isdir(site):
        shutil.rmtree(site)
    shutil.copytree(os.path.join(ROOT, "programs", "bible", "site"), site, ignore=shutil.ignore_patterns("DESIGN.md"))
    read = os.path.join(site, "read")
    os.makedirs(os.path.join(read, "data"))
    os.makedirs(os.path.join(read, "fonts"))
    css = text(os.path.join(HERE, "read.css"))
    for name in sorted(os.listdir(os.path.join(HERE, "fonts"))):
        src = os.path.join(HERE, "fonts", name)
        if name.endswith(".woff2"):
            hashed = put(os.path.join(read, "fonts"), name[:-6], "woff2", open(src, "rb").read())
            css = css.replace(f"fonts/{name}", f"fonts/{hashed}")
        else:
            shutil.copy(src, os.path.join(read, "fonts", name))

    names = {}
    for v in VERSIONS + ["refs"]:
        with open(os.path.join(DATA, v + ".txt"), "rb") as f:
            raw = f.read()
        names["data_" + v] = "data/" + put(os.path.join(read, "data"), v, "gz", gzip.compress(raw, 9, mtime=0))
    names["runtime"] = put(read, "l8", "js", open(os.path.join(WEB, "l8-runtime.js"), "rb").read())
    names["dom"] = put(read, "dom", "js", open(os.path.join(WEB, "dom.js"), "rb").read())
    names["wasm"] = put(read, "app", "wasm", open(wasm, "rb").read())
    names["icons"] = put(read, "icons", "svg", open(os.path.join(HERE, "icons.svg"), "rb").read())
    names["css"] = put(read, "read", "css", css.encode())
    js = text(os.path.join(HERE, "bible.js"))
    js = js.replace("../l8-runtime.js", "./" + names["runtime"]).replace("../dom.js", "./" + names["dom"])
    for k, n in names.items():
        js = js.replace("{{" + k + "}}", "/read/" + n)
    names["js"] = put(read, "bible", "js", js.encode())

    # (Inlined byte for byte: the Worker's CSP names its hash.)
    boot = text(os.path.join(HERE, "boot.js"))
    page = text(os.path.join(HERE, "page.html")).replace("{{boot}}", boot)
    for k in ("css", "js", "dom", "runtime", "icons"):
        page = page.replace("{{" + k + "}}", names[k])
    template = os.path.join(os.path.dirname(site), "bible-template.html")
    with open(template, "w", encoding="utf-8") as f:
        f.write(page)
    r = subprocess.run([prerender, template, DATA, read, os.path.join(HERE, "about.html")], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("prerender failed: " + r.stdout + r.stderr)

    with open(os.path.join(site, "robots.txt"), "w") as f:
        f.write("User-agent: *\nAllow: /read/\nDisallow: /read/esv/\nDisallow: /read/search\nDisallow: /api/\n"
                f"Sitemap: {SITE_URL}/sitemap.xml\n")
    urls = [SITE_URL + "/"]
    for v in VERSIONS:
        urls.append(f"{SITE_URL}/read/{v}/")
        base = os.path.join(read, v)
        for book in sorted(os.listdir(base)):
            if os.path.isdir(os.path.join(base, book)):
                for page_file in sorted(os.listdir(os.path.join(base, book)), key=lambda s: int(s.split(".")[0])):
                    urls.append(f"{SITE_URL}/read/{v}/{book}/{page_file[:-5]}")
    urls.append(SITE_URL + "/read/about")
    with open(os.path.join(site, "sitemap.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        f.writelines(f"<url><loc>{u}</loc></url>\n" for u in urls)
        f.write("</urlset>\n")
    hashed = boot_hash()
    with open(BOOT_HASH, encoding="utf-8") as f:
        kept = f.read()
    if kept != hashed:
        with open(BOOT_HASH, "w", encoding="utf-8") as f:
            f.write(hashed)
        print("worker/boot_hash.js rewritten: commit it")
    print(r.stdout.strip() + ", " + str(len(urls)) + " in the sitemap")


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
    for h in sorted(links):
        rel = h.lstrip("/")
        if h in ("/read/search",):
            continue
        if not (os.path.isfile(os.path.join(site, rel + ".html")) or os.path.isfile(os.path.join(site, rel, "index.html"))):
            missing.append(h)
    for h in missing[:5]:
        print("no page: " + h)
    print(f"{pages} pages, {bad} malformed, {len(links)} links, {len(missing)} to nothing")
    return bad == 0 and not missing


if __name__ == "__main__":
    if sys.argv[1:2] == ["--check"]:
        sys.exit(0 if check(sys.argv[2]) else 1)
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    build(*sys.argv[1:])
