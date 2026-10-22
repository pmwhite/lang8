#!/usr/bin/env python3
"""Build the web app's site (SKINS.md, the web) into SITE (.build/bible-site):

    make -j4 bible-web

The marketing pages (programs/bible/site/, without DESIGN.md) at the root,
and read/: the assets under hashed names (read.<hash>.css, bible.<hash>.js,
l8.<hash>.js, app.<hash>.wasm, icons.<hash>.svg, the fonts); the data under
data/<hash of it all>/, each file gzipped (each version whole, <v>.gz; the
plans, the language data, the cross references, the commentary, the Manual
and the original, by their names under programs/bible/data); the shell
(shell.html), which the Worker answers every reader's address with; and
About (about.html). Then robots.txt, and worker/boot_hash.js when the boot
script changed. Make schedules the versions, the other files, the manifest
and the site independently. --check parses the pages made: elements
balanced, ids unique.
"""
import base64
import gzip
import hashlib
import html.parser
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
WEB = os.path.join(ROOT, "web")
VERSIONS = ["bsb", "kjv", "web", "asv", "ylt"]
# The data files besides the versions, by their names under data/.
FILES = ["xref_index.bin", "xrefs.bin", "mhcc.txt", "help.txt", "orig.txt", "plans/mcheyne.txt", "plans/chrono.txt",
         "audio/souer.tim", "audio/hays.tim", "audio/gilbert.tim", "audio/henson.tim", "audio/henson.paths"]


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


def write_gzip(path, data):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(gzip.compress(data, 9, mtime=0))
    os.replace(tmp, path)


def files(data, out):
    """The data files besides the versions, each gzipped under out (those
    whose source is newer than their copy)."""
    names = FILES + sorted("lang/" + n for n in os.listdir(os.path.join(data, "lang")) if n.endswith((".bin", ".txt")))
    for name in names:
        src = os.path.join(data, name)
        dst = os.path.join(out, name + ".gz")
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        write_gzip(dst, open(src, "rb").read())


def manifest(cache, output):
    """Every data file by its name under data/, and a hash of them all."""
    files = {}
    for name in VERSIONS:
        files[name + ".gz"] = os.path.join(cache, name + ".gz")
    root = os.path.join(cache, "files")
    for directory, _, names in os.walk(root):
        for filename in names:
            path = os.path.join(directory, filename)
            files[os.path.relpath(path, root)] = path
    h = hashlib.sha256()
    for name, path in sorted(files.items()):
        h.update(name.encode())
        h.update(open(path, "rb").read())
    data = {"hash": h.hexdigest()[:10], "files": files}
    with open(output + ".tmp", "w") as f:
        json.dump(data, f, sort_keys=True)
    os.replace(output + ".tmp", output)


def build(wasm, data_manifest, site):
    if os.path.isdir(site):
        shutil.rmtree(site)
    shutil.copytree(os.path.join(ROOT, "programs", "bible", "site"), site, ignore=shutil.ignore_patterns("DESIGN.md"))
    read = os.path.join(site, "read")
    os.makedirs(os.path.join(read, "fonts"))
    css = text(os.path.join(HERE, "read.css"))
    fonts = []
    for name in sorted(os.listdir(os.path.join(HERE, "fonts"))):
        src = os.path.join(HERE, "fonts", name)
        if name.endswith(".woff2"):
            hashed = put(os.path.join(read, "fonts"), name[:-6], "woff2", open(src, "rb").read())
            css = css.replace(f"fonts/{name}", f"fonts/{hashed}")
            fonts.append("/read/fonts/" + hashed)
        else:
            shutil.copy(src, os.path.join(read, "fonts", name))

    with open(data_manifest) as f:
        data = json.load(f)
    dhash = data["hash"]
    for name, source in data["files"].items():
        target = os.path.join(read, "data", dhash, name)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(source, target)

    names = {"data": dhash}
    names["runtime"] = put(read, "l8", "js", open(os.path.join(WEB, "l8-runtime.js"), "rb").read())
    names["wasm"] = put(read, "app", "wasm", open(wasm, "rb").read())
    names["icons"] = put(read, "icons", "svg", open(os.path.join(HERE, "icons.svg"), "rb").read())
    names["css"] = put(read, "read", "css", css.encode())
    js = text(os.path.join(HERE, "skin.js"))
    js = js.replace("../../../../web/l8-runtime.js", "./" + names["runtime"])
    names["js"] = put(read, "bible", "js", js.encode())

    # The shell, which the Worker answers every reader's address with (its
    # head filled for the address), and About, the one page of its own.
    # (The boot script inlined byte for byte: the Worker's CSP names its hash.)
    boot = text(os.path.join(HERE, "boot.js"))
    page = text(os.path.join(HERE, "page.html")).replace("{{boot}}", boot)
    for k in ("css", "js", "runtime", "icons", "wasm", "data"):
        page = page.replace("{{" + k + "}}", names[k])

    def fill(fields):
        out = page
        for k, v in fields.items():
            out = out.replace("{{" + k + "}}", v)
        return out

    with open(os.path.join(read, "shell.html"), "w", encoding="utf-8") as f:
        f.write(fill({"title": "Smooth Bible", "og_title": "Smooth Bible", "bar_title": "Smooth Bible",
                      "main": "<noscript><p class=\"note\">Smooth Bible needs JavaScript to show the Bible.</p></noscript>\n"}))
    with open(os.path.join(read, "about.html"), "w", encoding="utf-8") as f:
        f.write(fill({"title": "About · Smooth Bible", "og_title": "About · Smooth Bible", "bar_title": "About",
                      "main": text(os.path.join(HERE, "about.html"))}))

    # The Service Worker (its build's files to keep, WEB.md §W9.1) and the
    # manifest (§W9.2), at fixed names.
    shell = ["/read/shell", "/read/about", "/read/manifest.webmanifest"] + ["/read/" + names[k] for k in ("css", "js", "runtime", "icons", "wasm")] + fonts + \
        ["/img/favicon.png", "/img/apple-touch-icon.png", "/img/icon-192.png", "/img/icon-512.png"]
    build_id = digest(json.dumps(shell).encode())
    sw = text(os.path.join(HERE, "sw.js")).replace("{{build}}", build_id).replace("{{data}}", dhash)
    sw = sw.replace("{{shell}}", json.dumps(shell))
    with open(os.path.join(read, "sw.js"), "w", encoding="utf-8") as f:
        f.write(sw)
    with open(os.path.join(read, "manifest.webmanifest"), "w", encoding="utf-8") as f:
        json.dump({
            "name": "Smooth Bible", "short_name": "Smooth Bible", "start_url": "/read/", "scope": "/read/",
            "display": "standalone", "background_color": "#FBF8F2", "theme_color": "#FBF8F2",
            "icons": [
                {"src": "/img/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                {"src": "/img/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                {"src": "/img/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            ],
        }, f, indent=1)

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
    print(f"{len(data['files'])} cached data files in data/{dhash}")


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
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    command, *args = sys.argv[1:]
    if command == "gz" and len(args) == 2:
        write_gzip(args[1], open(args[0], "rb").read())
    elif command == "files" and len(args) == 2:
        files(*args)
    elif command == "manifest" and len(args) == 2:
        manifest(*args)
    elif command == "site" and len(args) == 3:
        build(*args)
    elif command == "--check" and len(args) == 1:
        sys.exit(0 if check(args[0]) else 1)
    else:
        sys.exit(__doc__)
