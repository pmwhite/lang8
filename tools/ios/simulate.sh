#!/bin/sh
# Run Tempo.app in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT [CHECK]
# It boots an iPhone simulator, lets Tempo know where it is, launches it with
# L8_DEMO=1 (Tempo records a run by itself: ready at first, recording from
# 6 s, finished at 90 s, saved at 96 s; see programs/tempo/ios.l8) while the
# simulator walks a loop, and takes screenshots along the way, then one in
# dark mode. OUT gets the screenshots, Tempo's output and log, its saved
# log file, and any crash report. CHECK, if given, is programs/ios/check.l8
# built for the simulator: it runs first, and says what of the runtime works.
set -u
app=$1
out=$2
check=${3:-}
id=space.trailingwhite.tempo
mkdir -p "$out"
dev=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in sorted(devices.items()) if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
pick = [d for d in phones if d["name"] in ("iPhone 16", "iPhone 15", "iPhone 16 Pro", "iPhone 17")] or phones
print(pick[-1]["udid"])')
echo "simulator $dev"
xcrun simctl boot "$dev" 2>/dev/null || true
xcrun simctl bootstatus "$dev" -b
xcrun simctl ui "$dev" appearance light
if [ -n "$check" ]; then
  xcrun simctl spawn "$dev" "$check" > "$out/check.txt" 2>&1
  echo "check exited $?" >> "$out/check.txt"
  cat "$out/check.txt"
fi
xcrun simctl install "$dev" "$app"
xcrun simctl privacy "$dev" grant location "$id" || true
xcrun simctl privacy "$dev" grant location-always "$id" || true
xcrun simctl location "$dev" set 40.0,-75.0
shot() {
  xcrun simctl io "$dev" screenshot "$out/$1.png" >/dev/null 2>&1 && echo "shot $1"
}
# Its log, and its console (what it prints), from before it starts.
xcrun simctl spawn "$dev" log stream --level debug --predicate 'process == "Tempo"' > "$out/log.txt" 2>&1 &
logger=$!
SIMCTL_CHILD_L8_DEMO=1 xcrun simctl launch --console-pty "$dev" "$id" > "$out/console.txt" 2>&1 &
console=$!
sleep 4
shot 01-ready
# A loop of about 900 m, walked at 3 m/s while Tempo records.
xcrun simctl location "$dev" start --speed=3 \
  40.0,-75.0 40.0018,-75.0 40.0018,-74.9965 40.0,-74.9965 40.0,-75.0 \
  40.0018,-75.0 40.0018,-74.9965 40.0,-74.9965 40.0,-75.0
sleep 30
shot 02-recording
sleep 30
shot 03-recording-later
sleep 32
shot 04-finishing
sleep 9
shot 05-saved
xcrun simctl ui "$dev" appearance dark
sleep 3
shot 06-saved-dark
xcrun simctl location "$dev" clear || true
data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null || true)
[ -n "$data" ] && cp "$data"/Documents/* "$out"/ 2>/dev/null
kill "$logger" "$console" 2>/dev/null || true
xcrun simctl spawn "$dev" launchctl list > "$out/launchctl.txt" 2>&1 || true
find ~/Library/Logs/DiagnosticReports -newer "$app/Info.plist" -type f -exec cp {} "$out"/ \; 2>/dev/null || true
ls -la "$out"
