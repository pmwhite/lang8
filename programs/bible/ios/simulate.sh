#!/bin/sh
# Run SmoothBible.app (Smooth Bible) in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT GROUP
# It boots an iPhone simulator, launches the app with L8_DEMO=1, and takes it
# through one group of its demo with Darwin notifications
# (space.trailingwhite.smoothbible.demoN; see demo_do in
# programs/bible/ios_demo.l8, and DESIGN.md §5 and §7.10 for what each
# screenshot should show). The groups run in parallel CI jobs, each from a
# fresh install:
#   read    reading, the picker, selection and marks, the collapsing bar,
#           search, the library, the settings and themes, a relaunch
#   study   the interlinear, word study, grammar, definition, concordance
#   notes   notes read and written, the library's search and sort, and the
#           screen recording of transitions (transitions.mp4, with the
#           times of its sequences in transitions.txt)
#   more    Round 3 (DESIGN.md §8): previews, keeping the screen on,
#           history, chapter notes, the export (notes-export.md), the color
#           filter, Listen, the words of Jesus in red, and the largest text
#   store   the App Store's screenshots (store-1.png to store-6.png), on
#           the largest iPhone, and a plain launch's console (no bible:
#           lines in it, plain-launch.txt)
#   ios18   a few of read's and study's shots on an iOS 18 runtime (-ios18),
#           if the Mac has one
# After each step the script waits for the app to say it has settled (the
# notification space.trailingwhite.smoothbible.done, from `notifyutil -1`),
# with a timeout, rather than sleeping; then it takes the screenshot.
# OUT gets the screenshots, the app's output and log, timing.txt (each
# step's wait), and any crash report.
set -u
app=$1
out=$2
group=${3:-read}
id=space.trailingwhite.smoothbible
mkdir -p "$out"
now() { python3 -c 'import time; print("%.3f" % time.time())'; }
start=$(now)
dev=$("$(dirname "$0")/pick.sh" "$group")
if [ -z "$dev" ]; then
  if [ "$group" = ios18 ]; then
    echo "no iOS 18 runtime; older-iOS path unchecked" | tee "$out/ios18.txt"
    xcrun simctl list runtimes >> "$out/ios18.txt" 2>&1
    exit 0
  fi
  echo "no simulator"
  exit 1
fi
echo "simulator $dev"
xcrun simctl list devices available -j | python3 -c '
import json, sys
for rt, ds in json.load(sys.stdin)["devices"].items():
    for d in ds:
        if d["udid"] == sys.argv[1]:
            print(d["name"], rt.split(".")[-1])' "$dev" | tee "$out/device.txt"
xcrun simctl boot "$dev" 2>/dev/null || true
xcrun simctl bootstatus "$dev" -b >/dev/null
# (No keyboard tutorial over the first text field.)
for key in DidShowContinuousPathIntroduction KeyboardDidShowContinuousPathIntroduction; do
  xcrun simctl spawn "$dev" defaults write com.apple.keyboard.preferences "$key" -bool true 2>/dev/null || true
done
xcrun simctl ui "$dev" appearance light
xcrun simctl ui "$dev" content_size large 2>/dev/null || true
echo "booted in $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
xcrun simctl install "$dev" "$app"
echo "booted and installed in $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
# (The ios18 group's shots have -ios18 after their names.)
suffix=
[ "$group" = ios18 ] && suffix=-ios18
shot() {
  xcrun simctl io "$dev" screenshot "$out/$1$suffix.png" >/dev/null 2>&1 && echo "shot $1$suffix"
}
xcrun simctl spawn "$dev" log stream --predicate 'process == "SmoothBible" AND messageType >= 16' > "$out/log.txt" 2>&1 &
logger=$!
# Waiting for the app's word that it has settled: a waiter started before
# the step is sent, then waited for (at most 4 seconds). Should the waiter
# have been too late for the notification, its state (`notifyutil -g`)
# says what settled last: the step's number, or 1000 and a count of other
# settlings (a launch, the phone's appearance or text size), which the
# script counts too (events).
waiter=0
events=0
wait_start() {
  xcrun simctl spawn "$dev" notifyutil -1 "$id.done" >/dev/null 2>&1 &
  waiter=$!
  sleep 0.2
}
# wait_done EXPECTED_STATE LABEL [SECONDS]
wait_done() {
  end=$(( $(date +%s) + ${3:-4} ))
  while kill -0 "$waiter" 2>/dev/null && [ "$(date +%s)" -lt "$end" ]; do
    sleep 0.05
  done
  if kill -0 "$waiter" 2>/dev/null; then
    kill "$waiter" 2>/dev/null
    # (Missed, or not yet settled: its state, a few times.)
    for i in 1 2 3 4 5 6; do
      state=$(xcrun simctl spawn "$dev" notifyutil -g "$id.done" 2>/dev/null | awk '{print $NF}')
      [ "$state" = "$1" ] && break
      sleep 1
    done
    if [ "$state" = "$1" ]; then echo "$2: waiter late, state $state" >> "$out/timing.txt"
    else echo "$2: timed out (state $state, expected $1)" >> "$out/timing.txt"; fi
  fi
  wait "$waiter" 2>/dev/null
}
launch() {
  events=$((events + 1))
  wait_start
  SIMCTL_CHILD_L8_DEMO=1 xcrun simctl launch --console-pty "$dev" "$id" > "$out/$1" 2>&1 &
  console=$!
  # (The first launch may take minutes.)
  i=0
  while ! grep -q "bible: up\|Terminating app" "$out/$1" 2>/dev/null && [ "$i" -lt 2400 ]; do
    sleep 0.1
    i=$((i + 1))
  done
  wait_done $((1000 + events)) "launch" 6
}
# A setting of the simulator's (appearance, text size), which the app
# settles after.
ui() {
  events=$((events + 1))
  wait_start
  xcrun simctl ui "$dev" "$@" 2>/dev/null || true
  wait_done $((1000 + events)) "ui $*"
}
# A step: its notification, the wait for it to settle, its screenshot. With
# no name, no screenshot (a step that sets things up).
step() {
  wait_start
  xcrun simctl spawn "$dev" notifyutil -p "$id.demo$1"
  wait_done "$1" "$1 ${2:-}" "${3:-4}"
  [ -n "${2:-}" ] && shot "$2"
}
if [ "$group" = store ]; then
  # The status bar as the App Store's screenshots have it.
  xcrun simctl status_bar "$dev" override --time 9:41 --batteryState charged --batteryLevel 100 \
    --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 2>/dev/null || \
    xcrun simctl status_bar "$dev" override --time 9:41 --batteryState charged --batteryLevel 100
fi
launch console.txt
case "$group" in
read)
  shot 01-genesis-1
  step 31 01b-bar-at-rest
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
  # The collapsing bar (DESIGN.md, "Collapsing-bar evidence").
  step 15 15a-before-collapse
  step 16 15-collapsed
  step 32 15b-half
  step 33 15c-collapsed-opener
  step 34 16-bars-back
  step 35 16b-compact-tap
  step 36 16c-sheet-from-collapsed
  step 17 17-search
  step 18 18-search-scope
  step 19 19-search-recent
  step 20 20-library-highlights
  step 21 21-library-notes
  step 22 22-library-bookmarks
  step 23 23-settings
  step 24 24-settings-sepia
  step 25 25-sepia-reading
  step 26 26-black-large
  step 27 27-verse-lines
  step 28
  ui appearance dark
  shot 28-night
  ui content_size extra-extra-large
  shot 29-larger-text
  xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
  kill "$console" 2>/dev/null || true
  events=0
  launch console-again.txt
  shot 30-opened-again
  step 30 31-link-romans-8
  ;;
study)
  step 40 32-panel-study
  step 41 33-interlinear
  step 42 34-interlinear-greek
  step 43 35-word-study
  step 44 36-grammar
  step 45 37-definition
  step 46 38-concordance
  step 47 39-concordance-loved
  step 48 39b-concordance-filter
  step 49 40-concordance-jump
  step 50 41-edit-menu-study
  step 51 42-word-study-hebrew
  step 52 42b-definition-hebrew
  step 53 43-interlinear-hebrew
  step 54 43b-interlinear-long
  step 55 44-interlinear-untranslated
  step 56 45-word-study-night
  step 57 52-acknowledgements
  step 58 53-data-changes
  ;;
notes)
  step 11
  step 60 46-note-read
  step 61 47-note-edit
  step 62 48-add-to-note
  step 63 49-library-search
  step 64 50-library-sort
  step 65 51-library-newest
  # The screen recording of transitions: its sequences, and when each was.
  step 70
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec0=$(now)
  sleep 0.5
  : > "$out/transitions.txt"
  n=1
  for s in 71 72 73 74 75 76 77 78 79; do
    a=$(now)
    step "$s" "" 18
    b=$(now)
    echo "$n $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
    n=$((n + 1))
  done
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  ;;
more)
  # (DESIGN.md §8: shots 60 to 88.)
  step 100 60-xref-links
  step 101 61-preview-xref
  step 102 62-footnote-link
  step 103 63-preview-footnote
  step 104 64-preview-open
  step 105 65-preview-in-study 8
  step 106 66-preview-from-note 6
  step 107 67-preview-cross-chapter 6
  step 108 68-keep-screen-on 6
  step 109 69-picker-show-all 6
  step 110 70-history
  step 111 71-history-clear-menu
  step 112 72-library-compose 6
  step 113 73-chapter-note-editor 6
  step 114 74-chapter-note-glyph 6
  step 115 75-library-chapter-note 6
  step 116 76-export-sheet 6
  # The export's file (the demo keeps a copy in Documents).
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  cp "$data"/Documents/*.md "$out/notes-export.md" 2>/dev/null && echo "notes-export.md kept"
  step 117 77-highlight-filter-all 6
  step 118 78-highlight-filter-green
  step 119 79-listen-entry 6
  step 120 80-listening 10
  step 121 81-listen-paused
  step 122 82-listen-tray
  step 123 83-red-letter
  step 124 84-red-letter-night
  step 125
  ui content_size accessibility-extra-extra-extra-large
  step 125 85-ax-reader
  step 126 86-ax-tray
  step 127 87-ax-word-study 6
  step 128 88-ax-settings 6
  ui content_size large
  ;;
store)
  # The App Store's (DESIGN.md §8.9.7): light, Paper, the default size.
  shot store-1
  step 130 store-2
  step 131 store-3
  step 132 store-4 6
  step 133 store-5 6
  step 134 store-6 8
  # A plain launch (no L8_DEMO, no L8_TIMING), as in normal use: its console
  # must have no "bible:" lines.
  xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
  kill "$console" 2>/dev/null || true
  sleep 1
  xcrun simctl launch --console-pty "$dev" "$id" > "$out/plain-console.txt" 2>&1 &
  console=$!
  sleep 10
  xcrun simctl io "$dev" screenshot "$out/plain-launch.png" >/dev/null 2>&1
  n=$(grep -c "bible:" "$out/plain-console.txt")
  echo "plain launch: $n bible: lines" | tee "$out/plain-launch.txt"
  ;;
ios18)
  shot 01-genesis-1
  step 15 15a-before-collapse
  step 16 15-collapsed
  step 17 17-search
  step 8
  step 9
  step 10
  step 11
  step 23 23-settings 6
  step 28
  ui appearance dark
  shot 28-night
  ui appearance light
  step 40
  step 41 33-interlinear 6
  ;;
esac
echo "total $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
kill "$logger" "$console" 2>/dev/null || true
find ~/Library/Logs/DiagnosticReports -newer "$app/Info.plist" -type f -exec cp {} "$out"/ \; 2>/dev/null || true
ls -la "$out"
cat "$out/timing.txt"
