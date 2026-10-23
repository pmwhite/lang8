#!/bin/sh
# Build an app for hot reload on an iPhone (RELOAD.md): the app's own bundle
# (DIR's Info.plist, frameworks, resources, assets), but its executable is
# the hot reload host (programs/wasm/ios/host.l8), and beside it app.wasm,
# APP.l8 built as a module, and dev-server.txt naming the development
# server (web/dev.mjs) the host fetches builds from:
#   tools/ios/hot.sh device|sim APP.l8 DIR OUT HOST:PORT
#   tools/ios/hot.sh device programs/bible/ios/app.l8 programs/bible/ios .build/hot 192.168.0.231:8777
# then, on the development machine:
#   node web/dev.mjs -- programs/bible/ios/app.l8 -o .build/dev/bible-ios.wasm
# Everything else is as tools/ios/build-linux.sh (its variables too). The
# app needs the local network: the plist gets NSLocalNetworkUsageDescription
# and NSAllowsLocalNetworking.
set -eu
kind=$1
src=$2
dir=$(cd "$3" && pwd)
out=$4
server=${5:-}
here=$(cd "$(dirname "$0")" && pwd)
top=$(cd "$here/../.." && pwd)
l8=${L8:-$top/l8c3}
mkdir -p "$out"
work="$out/bundle-dir"
rm -rf "$work"
mkdir -p "$work"
for f in Info.plist frameworks resources PrivacyInfo.xcprivacy; do
  [ -e "$dir/$f" ] && cp "$dir/$f" "$work/"
done
# (The icons and colors too: the assets check compares them with the
# compiled catalog.)
for f in "$dir"/AppIcon*.png "$dir"/AppIcon.svg; do [ -e "$f" ] && cp "$f" "$work/"; done
[ -d "$dir/Colors" ] && cp -R "$dir/Colors" "$work/Colors"
[ -d "$dir/assets" ] && cp -R "$dir/assets" "$work/assets"
"$l8" wasm "$src" -o "$out/app.wasm"
printf '%s\n' "$server" > "$out/dev-server.txt"
rel=$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$out" "$top")
touch "$work/resources"
printf '%s/app.wasm\n%s/dev-server.txt\n' "$rel" "$rel" >> "$work/resources"
python3 -I - "$work/Info.plist" <<'PY'
import plistlib, sys
p = sys.argv[1]
d = plistlib.load(open(p, "rb"))
d["NSLocalNetworkUsageDescription"] = "Hot reload fetches the app's builds from the development server on this network."
ats = d.setdefault("NSAppTransportSecurity", {})
ats["NSAllowsLocalNetworking"] = True
plistlib.dump(d, open(p, "wb"))
PY
"$here/build-linux.sh" "$kind" "$top/programs/wasm/ios/host.l8" "$out" "$work"
