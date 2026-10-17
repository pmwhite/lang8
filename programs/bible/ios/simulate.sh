#!/bin/sh
# Run Bible.app in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT
# It boots an iPhone simulator and launches the app with L8_DEMO=1, which
# goes through it by itself (see demo_tick in programs/bible/ios.l8): Genesis
# 1 at first; the books at 4 s, Psalms' chapters at 7, Psalm 23 at 10, a
# footnote at 13, John 3 at 16, read on (the bars hidden) at 19, the bars
# back at 22. It takes a screenshot after each, then one in dark mode and
# one with a larger text size, and one after the app is opened again (it
# should be where it was). OUT gets the screenshots, the app's output and
# log, and any crash report.
set -u
app=$1
out=$2
id=space.trailingwhite.bible
mkdir -p "$out"
dev=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in sorted(devices.items()) if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
pick = [d for d in phones if d["name"] in ("iPhone 16", "iPhone 15", "iPhone 16 Pro", "iPhone 17")] or phones
print(pick[-1]["udid"])')
echo "simulator $dev"
xcrun simctl boot "$dev" 2>/dev/null || true
xcrun simctl bootstatus "$dev" -b >/dev/null
xcrun simctl ui "$dev" appearance light
xcrun simctl ui "$dev" content_size large 2>/dev/null || true
xcrun simctl install "$dev" "$app"
shot() {
  xcrun simctl io "$dev" screenshot "$out/$1.png" >/dev/null 2>&1 && echo "shot $1"
}
xcrun simctl spawn "$dev" log stream --predicate 'process == "Bible" AND messageType >= 16' > "$out/log.txt" 2>&1 &
logger=$!
SIMCTL_CHILD_L8_DEMO=1 xcrun simctl launch --console-pty "$dev" "$id" > "$out/console.txt" 2>&1 &
console=$!
# (From when it says it is up: the demo's clock starts then.)
for i in $(seq 60); do
  grep -q "bible: up" "$out/console.txt" 2>/dev/null && break
  sleep 0.5
done
sleep 2.5; shot 01-genesis-1
sleep 3; shot 02-books
sleep 3; shot 03-psalms
sleep 3; shot 04-psalm-23
sleep 3; shot 05-footnote
sleep 3; shot 06-john-3
sleep 3; shot 07-reading-on
sleep 3; shot 08-bars-back
xcrun simctl ui "$dev" appearance dark
sleep 2; shot 09-dark
xcrun simctl ui "$dev" content_size extra-extra-large 2>/dev/null || true
sleep 3; shot 10-larger-text
xcrun simctl ui "$dev" content_size large 2>/dev/null || true
xcrun simctl ui "$dev" appearance light
sleep 1
xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
kill "$console" 2>/dev/null || true
sleep 1
xcrun simctl launch --console-pty "$dev" "$id" > "$out/console-again.txt" 2>&1 &
console=$!
sleep 4; shot 11-opened-again
kill "$logger" "$console" 2>/dev/null || true
find ~/Library/Logs/DiagnosticReports -newer "$app/Info.plist" -type f -exec cp {} "$out"/ \; 2>/dev/null || true
ls -la "$out"
