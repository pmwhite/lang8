#!/usr/bin/env python3
"""An app's compiled asset catalog, kept in the repository so the app can be
built without a Mac (tools/ios/build-linux.sh):

  assets.py hash DIR     the SHA-256 of what actool compiles from DIR (its
                         AppIcon*.png and Colors/), and of tools/ios/assets.sh
  assets.py check DIR    whether DIR/assets was compiled from DIR as it is now
                         (exits 1, saying how to remake it, if not)
  assets.py plist DIR SDK OUT.plist IN.plist [BUILD_NUMBER]
                         the bundle's Info.plist: IN.plist (DIR's, PLATFORM
                         filled in for SDK, iphoneos or iphonesimulator) with
                         actool's keys (DIR/assets/SDK/icon.plist) and, for
                         iphoneos, Xcode's (DIR/assets/iphoneos/build.plist),
                         and CFBundleVersion set to BUILD_NUMBER if given
  assets.py get DIR SDK KEY   a key of DIR/assets/SDK/build.plist

DIR/assets is made on a Mac by tools/ios/assets.sh: for each SDK,
Assets.car and the icons actool writes beside it, icon.plist (its partial
Info.plist), and for iphoneos build.plist (the SDK's and Xcode's versions,
DTPlatformVersion and the rest); inputs.sha256 is `assets.py hash` of what
it was made from. CI's Smooth Bible assets workflow makes them whenever the
inputs change and pushes them to the ci-bible-assets branch, to copy here.
"""
import hashlib
import os
import plistlib
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def inputs(d):
    files = []
    for name in sorted(os.listdir(d)):
        if name.startswith("AppIcon") and name.endswith(".png"):
            files.append(os.path.join(d, name))
    colors = os.path.join(d, "Colors")
    if os.path.isdir(colors):
        for root, dirs, names in os.walk(colors):
            dirs.sort()
            for name in sorted(names):
                files.append(os.path.join(root, name))
    files.append(os.path.join(HERE, "assets.sh"))
    return files


def digest(d):
    h = hashlib.sha256()
    for f in inputs(d):
        rel = os.path.relpath(f, d) if f.startswith(os.path.abspath(d)) else os.path.basename(f)
        h.update(rel.encode() + b"\0")
        h.update(hashlib.sha256(open(f, "rb").read()).digest())
    return h.hexdigest()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    what, d = sys.argv[1], os.path.abspath(sys.argv[2])
    if what == "hash":
        print(digest(d))
    elif what == "check":
        kept = os.path.join(d, "assets", "inputs.sha256")
        have = open(kept).read().strip() if os.path.exists(kept) else None
        want = digest(d)
        if have != want:
            print(f"assets: {d}/assets is not compiled from the icons and colors there now "
                  f"({'none kept' if have is None else 'kept ' + have[:12]}, now {want[:12]}).\n"
                  "Push the change: CI's Smooth Bible assets workflow compiles them on a Mac\n"
                  "and pushes them to ci-bible-assets; copy them into DIR/assets "
                  "(tools/ios/assets.sh, on a Mac, does it there).", file=sys.stderr)
            sys.exit(1)
        print("assets: up to date")
    elif what == "plist":
        sdk, out, src = sys.argv[3], sys.argv[4], sys.argv[5]
        platform = {"iphoneos": "iPhoneOS", "iphonesimulator": "iPhoneSimulator"}[sdk]
        text = open(src, "rb").read().replace(b"PLATFORM", platform.encode())
        info = plistlib.loads(text)
        info.update(plistlib.load(open(os.path.join(d, "assets", sdk, "icon.plist"), "rb")))
        if sdk == "iphoneos":
            build = plistlib.load(open(os.path.join(d, "assets", sdk, "build.plist"), "rb"))
            info.update({k: v for k, v in build.items() if k.startswith("DT") or k == "BuildMachineOSBuild"})
        if len(sys.argv) > 6 and sys.argv[6]:
            info["CFBundleVersion"] = sys.argv[6]
        with open(out, "wb") as f:
            plistlib.dump(info, f, fmt=plistlib.FMT_XML)
    elif what == "get":
        sdk, key = sys.argv[3], sys.argv[4]
        print(plistlib.load(open(os.path.join(d, "assets", sdk, "build.plist"), "rb"))[key])
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
