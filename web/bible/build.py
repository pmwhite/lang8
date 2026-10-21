#!/usr/bin/env python3
"""Build the web reader's site (WEB.md §W1.9) into SITE (.build/bible-site):

    make -j4 bible-web

The marketing pages (programs/bible/site/, without DESIGN.md) at the root,
and read/: the assets under hashed names (read.<hash>.css, bible.<hash>.js,
dom.<hash>.js, l8.<hash>.js, app.<hash>.wasm, icons.<hash>.svg, the fonts);
the data under data/<hash of it all>/: each version whole (<v>.gz), book
by book (<v>/<BOOK>.gz) and its sizes table (<v>.sizes.gz, made by SIZES,
tools/sizes.l8); the shell (shell.html), which the Worker answers every
reader's address with; and About (about.html). Then robots.txt, and
worker/boot_hash.js when the boot script changed. Make schedules version, refs,
manifest and site stages independently. --check parses the pages
made: elements balanced, ids unique.
"""
import base64
import gzip
import hashlib
import html.parser
import json
import os
import shutil
import subprocess
import sys
import tempfile

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


def write_gzip(path, data):
    with open(path, "wb") as f:
        f.write(gzip.compress(data, 9, mtime=0))


def version(sizes, source, output, name):
    """One translation's independently cached gzip files."""
    parent = os.path.dirname(output)
    os.makedirs(parent, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=parent) as staging:
        raw = open(source, "rb").read()
        write_gzip(os.path.join(staging, name + ".gz"), raw)
        measured = subprocess.run([sizes, source], capture_output=True, check=True)
        write_gzip(os.path.join(staging, name + ".sizes.gz"), measured.stdout)
        lines = raw.split(b"\n")
        starts = [i for i, line in enumerate(lines) if line.startswith(b"B")]
        os.makedirs(os.path.join(staging, name))
        for k, at in enumerate(starts):
            end = starts[k + 1] if k + 1 < len(starts) else len(lines)
            book = lines[at][1:4].decode()
            data = b"\n".join(lines[at:end]).rstrip(b"\n") + b"\n"
            write_gzip(os.path.join(staging, name, book + ".gz"), data)
        # Publish only a complete version, removing any books no longer present.
        if os.path.isdir(output):
            shutil.rmtree(output)
        os.rename(staging, output)


def manifest(cache, output):
    """Hash the same sorted gzip names/bytes as the original monolithic build."""
    files = {"refs.gz": os.path.join(cache, "refs.gz")}
    for name in VERSIONS:
        root = os.path.join(cache, name)
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
    for name in sorted(os.listdir(os.path.join(HERE, "fonts"))):
        src = os.path.join(HERE, "fonts", name)
        if name.endswith(".woff2"):
            hashed = put(os.path.join(read, "fonts"), name[:-6], "woff2", open(src, "rb").read())
            css = css.replace(f"fonts/{name}", f"fonts/{hashed}")
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
    names["dom"] = put(read, "dom", "js", open(os.path.join(WEB, "dom.js"), "rb").read())
    names["wasm"] = put(read, "app", "wasm", open(wasm, "rb").read())
    names["icons"] = put(read, "icons", "svg", open(os.path.join(HERE, "icons.svg"), "rb").read())
    names["css"] = put(read, "read", "css", css.encode())
    js = text(os.path.join(HERE, "bible.js"))
    js = js.replace("../l8-runtime.js", "./" + names["runtime"]).replace("../dom.js", "./" + names["dom"])
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
    if command == "version" and len(args) == 4:
        version(*args)
    elif command == "refs" and len(args) == 2:
        write_gzip(args[1] + ".tmp", open(args[0], "rb").read())
        os.replace(args[1] + ".tmp", args[1])
    elif command == "manifest" and len(args) == 2:
        manifest(*args)
    elif command == "site" and len(args) == 3:
        build(*args)
    elif command == "--check" and len(args) == 1:
        sys.exit(0 if check(args[0]) else 1)
    else:
        sys.exit(__doc__)
