#!/bin/sh
# Run SmoothBible.app (Smooth Bible) in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT
# It boots an iPhone simulator, launches the app with L8_DEMO=1, and takes it
# through its demo with Darwin notifications (see demo_do in
# programs/bible/ios.l8): Genesis 1 at first, the books, Psalms' chapters,
# Psalm 23, a footnote, John 3, read on (the bars hidden), the bars back. It
# takes a screenshot after each, then one in dark mode and one with a larger
# text size, one after the app is opened again (it should be where it was),
# and one after a link to Romans 8. OUT gets the screenshots, the app's output and
# log, and any crash report.
set -u
app=$1
out=$2
id=space.trailingwhite.smoothbible
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
xcrun simctl spawn "$dev" log stream --predicate 'process == "SmoothBible" AND messageType >= 16' > "$out/log.txt" 2>&1 &
logger=$!
SIMCTL_CHILD_L8_DEMO=1 xcrun simctl launch --console-pty "$dev" "$id" > "$out/console.txt" 2>&1 &
console=$!
# (Once it says it is up: the first launch may take minutes.) Each step
# is a Darwin notification the app takes (space.trailingwhite.smoothbible.demoN),
# its screenshot after its animations.
for i in $(seq 1200); do
  grep -q "bible: up" "$out/console.txt" 2>/dev/null && break
  sleep 0.5
done
sleep 2
step() {
  [ "$1" = 1 ] || xcrun simctl spawn "$dev" notifyutil -p "$id.demo$1"
  sleep 2
  shot "$2"
}
step 1 01-genesis-1
step 2 02-books
step 3 03-psalms
step 4 04-psalm-23
step 5 05-footnote
step 6 06-john-3
step 7 07-reading-on
step 8 08-bars-back
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
for i in $(seq 240); do
  grep -q "bible: up" "$out/console-again.txt" 2>/dev/null && break
  sleep 0.5
done
sleep 2; shot 11-opened-again
# A link to a chapter (the simulator asks first: the shot shows that).
xcrun simctl openurl "$dev" "bsb://rom/8"
sleep 2; shot 12-link-romans-8
kill "$logger" "$console" 2>/dev/null || true
find ~/Library/Logs/DiagnosticReports -newer "$app/Info.plist" -type f -exec cp {} "$out"/ \; 2>/dev/null || true
ls -la "$out"
