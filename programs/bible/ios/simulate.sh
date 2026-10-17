#!/bin/sh
# Run SmoothBible.app (Smooth Bible) in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT
# It boots an iPhone simulator, launches the app with L8_DEMO=1, and takes it
# through its demo with Darwin notifications (space.trailingwhite.smoothbible.demoN;
# see demo_do in programs/bible/ios_demo.l8, and DESIGN.md §5 for what each
# screenshot should show). Steps 28 and 29 switch the simulator to dark mode
# and a larger text size; then the app is opened again (30-opened-again,
# where it was), and step 30 opens a link to Romans 8 (31-link-romans-8).
# OUT gets the screenshots, the app's output and log, and any crash report.
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
# (Once it says it is up: the first launch may take minutes.)
for i in $(seq 1200); do
  grep -q "bible: up" "$out/console.txt" 2>/dev/null && break
  sleep 0.5
done
sleep 2
# A step: its notification, then its screenshot after its animations (a
# longer wait after a change of theme or size).
step() {
  [ "$1" = 1 ] || xcrun simctl spawn "$dev" notifyutil -p "$id.demo$1"
  sleep "${3:-2}"
  shot "$2"
}
step 1 01-genesis-1
step 2 02-chapter-divider
step 3 03-picker
step 4 04-picker-query
step 5 05-chapters
step 6 06-psalm-23
step 7 07-footnote
step 8 08-john-3-16
step 9 09-selected
step 10 10-selected-two
step 11 11-marks
step 12 12-highlight
step 13 13-edit-menu
step 14 14-note-editor
step 15 15-reading-on
step 16 16-bars-back
step 17 17-search
step 18 18-search-scope
step 19 19-search-recent
step 20 20-library-highlights
step 21 21-library-notes
step 22 22-library-bookmarks
step 23 23-settings
step 24 24-settings-sepia 3
step 25 25-sepia-reading
step 26 26-black-large 3
step 27 27-verse-lines 3
xcrun simctl spawn "$dev" notifyutil -p "$id.demo28"
sleep 1
xcrun simctl ui "$dev" appearance dark
sleep 3; shot 28-night
xcrun simctl ui "$dev" content_size extra-extra-large 2>/dev/null || true
sleep 3; shot 29-larger-text
sleep 1
xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
kill "$console" 2>/dev/null || true
sleep 1
SIMCTL_CHILD_L8_DEMO=1 xcrun simctl launch --console-pty "$dev" "$id" > "$out/console-again.txt" 2>&1 &
console=$!
for i in $(seq 240); do
  grep -q "bible: up" "$out/console-again.txt" 2>/dev/null && break
  sleep 0.5
done
sleep 2; shot 30-opened-again
xcrun simctl spawn "$dev" notifyutil -p "$id.demo30"
sleep 2; shot 31-link-romans-8
xcrun simctl ui "$dev" content_size large 2>/dev/null || true
xcrun simctl ui "$dev" appearance light
kill "$logger" "$console" 2>/dev/null || true
find ~/Library/Logs/DiagnosticReports -newer "$app/Info.plist" -type f -exec cp {} "$out"/ \; 2>/dev/null || true
ls -la "$out"
