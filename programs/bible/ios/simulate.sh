#!/bin/sh
# Run SmoothBible.app (Smooth Bible) in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT GROUP
# It boots an iPhone simulator, launches the app with L8_DEMO=1, and takes it
# through one group of its demo with Darwin notifications
# (space.trailingwhite.smoothbible.demoN; see demo_do in
# programs/bible/ios_demo.l8, and DESIGN.md §5 and §7.10 for what each
# screenshot should show). CI runs the groups on five Macs, two one after
# another on each, every group on a fresh simulator of its own:
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
#   versions  Round 4 (DESIGN.md §9.9): the version picker, switching in
#           place, marks across versions, Compare, the ESV (through its
#           fixture, esv-fixture/, copied into the app's Library and named
#           by L8_ESV_FIXTURE: no key, no network), its states, search
#           under it, Study's segments, the acknowledgements, the largest
#           text; and the recording of sequences 10 and 11
#           (versions-transitions.mp4, with versions-transitions.txt)
#   plans   Round 5 (DESIGN.md §10.6, §11.6), on the demo clock: Go To's
#           New Ribbon… and Reading Plans, the plans and a plan's detail, a
#           plan started there and read, Day Done, its unfinished days;
#           the plan's Daily Reminder, its Time row (the shim's answer
#           forced) and a reminder opened, its authorization alert (last: it
#           outlives the app); Share as
#           Image (the card kept as share-card.png); exact senses, related
#           words, the largest text; the recording of sequence 12
#           (plans-transitions.mp4); and Versions and Acknowledgements
#           popped before a theme's change (1.0 (11)'s crash), checked
#   ribbons Round 6 as revised (DESIGN.md §11.6), on the demo clock, from a
#           1.0 (15) readings.tsv and a history written before the first
#           launch: the readings made ribbons; New Ribbon Here… from the
#           title's menu; a carried ribbon following rests and a read
#           chapter, put down by a jump, picked up by the capsule, kept by
#           sheets, carried by Listen; Leave Here, Move Ribbon Here; the
#           Ribbon screen, rename, delete; New Ribbon… in Go To; Reading
#           Plans and A Chapter a Day; and the recording of sequence 13
#           (ribbons-transitions.mp4); its log's checks in ribbons.txt
#   listen  Round 7 (DESIGN.md §12.7), with the audio fixture and the ESV's:
#           the Listen section, Voice, a recording followed, Loading…, a
#           reader changed, Faster, the next chapter, offline, the ESV by
#           chapter, the KJV's voice, Downloads, the acknowledgements, the
#           largest text; and the recording of sequence 14
#           (listen-transitions.mp4); its log's checks in listen.txt
# Every group has the audio fixture (programs/bible/demo/audio, copied into
# the app's Library and named by L8_AUDIO_FIXTURE), so no recording is
# fetched from the network in CI.
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
# (SIM_DEVICE, if given: the simulator, CI's, booted ahead; else pick.sh's.)
dev=${SIM_DEVICE:-$("$(dirname "$0")/pick.sh" "$group")}
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
touch "$out/.started"
xcrun simctl boot "$dev" 2>/dev/null || true
# (Its boot's stages, and when each began, in timing.txt.)
xcrun simctl bootstatus "$dev" -b 2>&1 | while read -r line; do
  stage=$(echo "$line" | sed 's/[0-9.]*%//; s/ *$//')
  [ "$stage" = "${prev:-}" ] && continue
  prev=$stage
  echo "boot at $(python3 -c "print(round($(now) - $start))") s: $stage" >> "$out/timing.txt"
done
# (No keyboard tutorial over the first text field.)
for key in DidShowContinuousPathIntroduction KeyboardDidShowContinuousPathIntroduction; do
  xcrun simctl spawn "$dev" defaults write com.apple.keyboard.preferences "$key" -bool true 2>/dev/null || true
done
xcrun simctl ui "$dev" appearance light
xcrun simctl ui "$dev" content_size large 2>/dev/null || true
echo "booted in $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
xcrun simctl install "$dev" "$app"
echo "booted and installed in $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
# (The versions group's ESV: the fixture, in the app's data container.)
fixture=
if [ "$group" = versions ] || [ "$group" = listen ]; then
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  if [ -n "$data" ]; then
    mkdir -p "$data/Library/esv-fixture"
    cp "$(dirname "$0")"/esv-fixture/* "$data/Library/esv-fixture/" && echo "esv fixture installed"
    fixture=Library/esv-fixture
  fi
fi
# (Every group's audio: the fixture.)
audio_fixture=
data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
if [ -n "$data" ]; then
  mkdir -p "$data/Library/audio-fixture"
  cp "$(dirname "$0")"/../demo/audio/tone.mp3 "$(dirname "$0")"/../demo/audio/fixture.tim \
    "$(dirname "$0")"/../demo/audio/esv-audio-*.json "$data/Library/audio-fixture/" && echo "audio fixture installed"
  echo ok > "$data/Library/audio-fixture/mode"
  audio_fixture=Library/audio-fixture
fi
# (The ribbons group's 1.0 (15), before the first launch: its history,
# Psalm 23:1 and Acts 9:1 and 10:9, yesterday at 20:40, 21:00 and 21:20,
# local time; four readings, Romans 3 two hours ago, Acts 10:9 yesterday at
# 21:20, John 15 three days ago and Psalm 24 twenty days ago, and a
# CLEARED line; readingsSeeded set. DESIGN.md §11.6.)
if [ "$group" = ribbons ]; then
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  if [ -n "$data" ]; then
    mkdir -p "$data/Library/Application Support/SmoothBible"
    python3 - "$data/Library/Application Support/SmoothBible" <<'PY'
import datetime, sys, time
d = datetime.date.today() - datetime.timedelta(days=1)
def t(h, m):
    return int(time.mktime(datetime.datetime(d.year, d.month, d.day, h, m).timetuple()))
now = int(time.time())
day = 86400
with open(sys.argv[1] + "/history.tsv", "w") as f:
    f.write("PSA\t23\t1\t%d\t0\t1\nACT\t9\t1\t%d\t0\t1\nACT\t10\t9\t%d\t0\t1\n" % (t(20, 40), t(21, 0), t(21, 20)))
with open(sys.argv[1] + "/readings.tsv", "w") as f:
    f.write("READING\tROM\t3\t0\t0\t%d\t%d\n" % (now - 4 * day, now - 2 * 3600))
    f.write("READING\tACT\t10\t9\t0\t%d\t%d\n" % (t(21, 0), t(21, 20)))
    f.write("READING\tJHN\t15\t0\t0\t%d\t%d\n" % (now - 6 * day, now - 3 * day))
    f.write("READING\tPSA\t24\t0\t0\t%d\t%d\n" % (now - 25 * day, now - 20 * day))
    f.write("CLEARED\t%d\n" % (now - 5 * day))
PY
    echo "ribbons group's 1.0 (15) files written"; cat "$data/Library/Application Support/SmoothBible/"*.tsv
  fi
  xcrun simctl spawn "$dev" defaults write "$id" readingsSeeded -bool true 2>/dev/null || true
fi
# (Every other group: the server as if it were not there, L8_ESV_OFF, so
# that no shot depends on the network or shows the ESV; review r5-1.)
esv_off=1
[ "$group" = versions ] && esv_off=
[ "$group" = listen ] && esv_off=
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
  SIMCTL_CHILD_L8_DEMO=1 SIMCTL_CHILD_L8_ESV_FIXTURE=$fixture SIMCTL_CHILD_L8_ESV_OFF=$esv_off SIMCTL_CHILD_L8_AUDIO_FIXTURE=$audio_fixture xcrun simctl launch --console-pty "$dev" "$id" > "$out/$1" 2>&1 &
  console=$!
  # (The first launch may take minutes.)
  i=0
  while ! grep -q "bible: up\|Terminating app" "$out/$1" 2>/dev/null && [ "$i" -lt 2400 ]; do
    sleep 0.1
    i=$((i + 1))
  done
  wait_done $((1000 + events)) "launch" 6
  echo "$1 up at $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
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
# A step whose shot is of a toast: taken as soon as the app logs the toast
# (TEXT, its words), whether or not the settling's notification is caught
# in time (review r8-1: 163's waiter was late, and the toast gone).
step_toast() {
  n0=$(grep -c "bible: toast $3" "$out/console.txt" 2>/dev/null)
  wait_start
  xcrun simctl spawn "$dev" notifyutil -p "$id.demo$1"
  i=0
  while [ "$(grep -c "bible: toast $3" "$out/console.txt" 2>/dev/null)" -le "$n0" ] && [ "$i" -lt 160 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  sleep 0.4
  shot "$2"
  wait_done "$1" "$1 $2" 4
}
# When the app began step N (seconds, its own clock: "at unix ms" after
# "demo step N"), to mark a recording from (review r8-1).
step_at() {
  awk -v want="bible: demo step $1" '$0 == want { found = 1; next } found && /at unix ms/ { t = $NF; found = 0 } END { printf "%.3f", t / 1000 }' "$out/console.txt"
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
  # The title's push (owner, 2026-10-18): John 4's opener under the bar,
  # expanded and compact; console.txt has each point's "bible: push" lines.
  step 262 15d-push-before
  step 263 15e-push-mid
  step 264 15f-push-after
  step 265 15g-push-compact-before
  step 266 15h-push-compact-mid
  step 267 15i-push-compact-after
  # Genesis 1's top: its name in the bar (the way to Go To). The status bar
  # tapped (owner, 2026-10-18): to John 3's top, then to John 2's.
  step 268 15j-genesis-1-title
  step 269 15k-status-bar-chapter-top
  step 285 15l-status-bar-previous-chapter
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
  step 129 79b-listen-entry-night 6
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
  step 135 store-7 6
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
versions)
  # (DESIGN.md §9.9: shots 100 to 130.)
  step 200
  step 201 100-settings-version
  step 202 101-versions
  step 203 102-kjv-behind
  step 204 103-kjv-john-3
  step 205 104-kjv-matt-17
  step 206 105-bsb-matt-17
  step 207 106-library-kjv-only 6
  step 208 107-web-psalm-23
  step 209 108-asv-psalm-23
  step 210 109-ylt-genesis-1
  step 211 110-red-letter-asv 6
  step 212 111-compare
  step 213 112-compare-esv 6
  # (Compare with the ESV in the dark: Night.)
  ui appearance dark
  shot 112b-compare-esv-night
  ui appearance light
  step 214 113-compare-next
  step 215 114-compare-to-kjv
  step 216 115-esv-loading 6
  step 217 116-esv-john-4 8
  step 218 117-esv-footer 6
  step 219 118-esv-3john 6
  step 220 119-esv-offline 6
  step 221 120-esv-busy 6
  step 222 121-esv-search 6
  step 223 122-esv-search-online 6
  step 233 121b-esv-search-none 6
  step 234 122b-esv-search-light 6
  step 235 122c-esv-search-more 6
  step 238 122d-esv-search-last 6
  step 224 123-study-words 6
  step 225 124-study-references
  step 226 125-xref-preview
  step 227 126-study-commentary
  step 228 127-commentary-preview
  step 229 128-acknowledgements 6
  # The glide through the ESV's John 3 to 5, its answers let go by the demo
  # mid-glide (DESIGN.md §9.4.11, review r5-1), and its checks: no offset
  # write while moving (anywhere in the run); every frame moved by its own
  # step; it lands in John 5; John 4 filled in place while moving and on
  # the screen; John 5, come once the glide was in it, kept for rest and
  # swapped in there; JHN 5 asked for before its row was seen; the line kept
  # at rest (and something to compare); the cache within 500; the glide's
  # placeholders within 10% of the text.
  step 239 117b-esv-glide 16
  python3 - "$out/console.txt" <<'PY' | tee "$out/glide.txt"
import re, sys
log = open(sys.argv[1], errors="replace").read().splitlines()
bad = []
writes = [l for l in log if "offset write while moving" in l]
print("offset writes while moving: %d" % len(writes))
if writes: bad.append("offset write while moving: %d" % len(writes))
steps = [int(l.split()[-1]) for l in log if l.startswith("bible: glide step ")]
ys = [int(l.split()[-1]) for l in log if l.startswith("bible: glide y ")]
off = [i for i in range(1, len(ys)) if abs(ys[i] - ys[i - 1] - steps[i]) > 50]
print("glide frames %d, off by more than 0.5 pt: %d" % (len(ys), len(off)))
if not ys or off: bad.append("glide frames off: %s" % off[:5])
j5 = [int(l.split()[-1]) for l in log if l.startswith("bible: glide john 5 is ")]
lands = [int(l.split()[-1]) for l in log if l.startswith("bible: glide lands in ")]
print("glide lands in %s (John 5: %s)" % (lands[-1:], j5[-1:]))
if not j5 or not lands or lands[-1] != j5[-1]: bad.append("the glide does not land in John 5")
# Each arrival in the glide: c, moving, visible, above.
g0 = max([i for i, l in enumerate(log) if l.startswith("bible: glide john 5 is ")] or [0])
g1 = min([i for i, l in enumerate(log) if i > g0 and l == "bible: glide at rest"] or [len(log)])
arr = []
for i in range(g0, g1):
    if log[i].startswith("bible: esv arrived ") and i + 3 < len(log):
        arr.append(tuple(int(log[i + k].split()[-1]) for k in range(4)))
print("arrivals in the glide (c, moving, visible, above): %s" % arr)
if not [a for a in arr if a[1] == 1 and a[2] == 1 and a[3] == 0]: bad.append("no arrival on the screen while moving")
if not [a for a in arr if a[1] == 1 and a[3] == 1]: bad.append("no arrival above the reading line while moving")
if j5:
    j5 = j5[-1]
    start = max(i for i, l in enumerate(log) if l.startswith("bible: glide john 5 is "))
    end = min([i for i, l in enumerate(log) if i > start and l == "bible: glide rested"] or [len(log)])
    asked = [i for i, l in enumerate(log) if start < i < end and l.startswith("bible: esv asked ") and (int(l.split()[-1]) // 10 == j5 or int(l.split()[-1]) == (j5 - 1) * 10 + 2)]
    seen = [i for i, l in enumerate(log) if start < i < end and l == "bible: esv row visible %d" % j5]
    print("JHN 5 asked at line %s, its row first seen at %s" % (asked[:1], seen[:1]))
    if not asked or seen and seen[0] < asked[0]: bad.append("JHN 5 not asked before its row was seen")
rest = [i for i, l in enumerate(log) if l == "bible: glide at rest"]
done = [i for i, l in enumerate(log) if l == "bible: glide rested"]
fixed = [int(l.split()[-1]) for l in log[rest[-1]:done[-1]] if l.startswith("bible: esv fixed line ")] if rest and done else []
pend = [int(l.split()[-1]) for l in log[rest[-1]:done[-1]] if l.startswith("bible: esv rest pending ")] if rest and done else []
print("rows kept for rest, swapped in at rest: %s" % pend)
if not pend or pend[0] < 1: bad.append("no row kept for rest was swapped in at rest")
if len(fixed) >= 2:
    print("fixed line at rest before/after: %d %d" % (fixed[-2], fixed[-1]))
    if abs(fixed[-2] - fixed[-1]) > 1: bad.append("the fixed line moved")
else: bad.append("at rest: no fixed line to compare")
if not rest: bad.append("the glide never rested")
cache = [int(re.search(r"cache (\d+) verses", l).group(1)) for l in log if "bible: esv cache " in l]
print("cache at most %d" % max(cache or [0]))
if max(cache or [0]) > 500: bad.append("cache past 500")
rows = [(i, l) for i, l in enumerate(log) if l.startswith("bible:   placeholder ") or l.startswith("bible:   filled ")]
worst = 0.0
for (i, a), (_, b) in zip(rows[::2], rows[1::2]):
    h0, h1 = int(a.split()[-1]), int(b.split()[-1])
    e = 100.0 * abs(h1 - h0) / max(h0, 1)
    if g0 < i < g1: worst = max(worst, e)
    print("placeholder %d filled %d (%.1f%%)%s" % (h0, h1, e, " (in the glide)" if g0 < i < g1 else ""))
print("the glide's worst placeholder: %.1f%%" % worst)
if worst >= 10.0: bad.append("a glide placeholder %.1f%% off" % worst)
print("FAILED: " + "; ".join(bad) if bad else "glide checks passed")
PY
  grep -q "glide checks passed" "$out/glide.txt" || failed=1
  step 230
  ui content_size accessibility-extra-extra-extra-large
  step 231 129-ax-compare 6
  step 232 130-ax-tray-six 6
  ui content_size large
  # The screen recording of sequences 10 and 11.
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
  for s in 236 237; do
    a=$(now)
    step "$s" "" 18
    b=$(now)
    echo "$((s - 226)) $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  done
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # The ESV's search never shows more than its page of 100 (DESIGN.md
  # §9.4.1: at most 500 verses on a page): every "esv search shown N".
  grep -o "esv search shown [0-9]*" "$out/console.txt" > "$out/esv-search.txt"
  n=$(wc -l < "$out/esv-search.txt")
  most=$(awk '$4 > m { m = $4 } END { print m + 0 }' "$out/esv-search.txt")
  echo "pages shown: $n; most shown at once: $most" | tee -a "$out/esv-search.txt"
  if [ "$most" -gt 100 ] || [ "$n" -eq 0 ]; then
    echo "FAILED: the ESV's search showed more than 100 at once (or nothing)" | tee -a "$out/esv-search.txt"
    failed=1
  fi
  ;;
plans)
  # (DESIGN.md §10.6: shots 140 to 158.)
  step 240
  step 241 140-goto-today 6
  step 242 141-plans
  step 243 142-plan-detail
  step 244 143-plan-started 8
  step 245 144-plan-partial 8
  step 246 145-day-done 6
  step 247 146-catch-up 6
  step 248 147-plan-reminder 8
  step 250 149-time-row 8
  step 251 150-reminder-open 6
  # (The plan stopped with its reminder on, and started again: the switch
  # off; review r5-1.)
  step 272 149b-plan-again-reminder-off 10
  step 252 151-share-sheet 8
  step 253 152-share-composer 8
  # The card at full size, as the demo kept it: exactly 1080 × 1080.
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  if cp "$data/Documents/share-card.png" "$out/share-card.png" 2>/dev/null; then
    size=$(sips -g pixelWidth -g pixelHeight "$out/share-card.png" | awk '/pixel/ { printf "%s ", $2 }')
    echo "share-card.png: $size" | tee "$out/share-card.txt"
    [ "$size" = "1080 1080 " ] || { echo "FAILED: the card is not 1080 x 1080" | tee -a "$out/share-card.txt"; failed=1; }
  else
    echo "FAILED: no share-card.png" | tee "$out/share-card.txt"
    failed=1
  fi
  step 254 153-share-night-portrait 6
  step 255 154-word-sense 8
  step 256 155-concordance-sense 6
  step 270 154b-word-gods 8
  step 257 156-related 8
  step 258 157-lemma-study 6
  step 271 156b-related-chesed 8
  step 261 "" 10
  ui content_size accessibility-extra-extra-extra-large
  step 259 158-ax-goto-today 8
  ui content_size large
  # The screen recording of sequence 12.
  # (Sequence 12's setup, before the mark: review r6-1.)
  step 341 "" 8
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
  a=$(now)
  step 260 "" 22
  b=$(now)
  echo "12 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # The Daily Reminder turned on, its authorization alert: last, as the
  # system's alert outlives the app and can't be answered here (the Time
  # row's shot, before, had the shim's answer forced by the demo).
  step 249 148-notify-prompt 8
  # What was scheduled, the shim's answers and the handler called; the
  # lists that were popped under a theme's change.
  grep -h "daily reminders\|notification authorization\|completion handler\|reminder opened\|popped lists\|card size\|card w\|card h" \
    "$out/console.txt" > "$out/notify.txt" 2>/dev/null
  cat "$out/notify.txt"
  grep -q "scheduled [0-9]* daily reminders" "$out/notify.txt" || { echo "FAILED: nothing scheduled" | tee -a "$out/notify.txt"; failed=1; }
  grep -q "popped lists survived" "$out/notify.txt" || { echo "FAILED: the popped lists' step did not finish" | tee -a "$out/notify.txt"; failed=1; }
  ;;
ribbons)
  # (DESIGN.md §11.6: shots 160 to 182.)
  step 290 160-ribbons-migrated 6
  step 291 161-title-menu 10
  step 292 162-new-ribbon 8
  step_toast 293 163-ribbon-made "Reading with Morning"
  step 294 164-carried-menu 6
  step 295 165-follows 8
  step 296 166-back-a-little 6
  step 297 167-chapter-read 6
  step 298 168-jump-puts-down 10
  step 299 169-capsule-picks-up 6
  step 300 170-sheets-keep 10
  step 301 171-open-another 6
  step 302 172-listen-carries 10
  step 303 173-leave-here 8
  step 304 174-move-here 10
  step 305 175-ribbon-details 8
  step 306 176-renamed 6
  step 307 177-deleted 6
  step 308 178a-new-ribbon-jude 10
  step 309 178-new-from-go-to 6
  ui content_size accessibility-extra-extra-extra-large
  step 310 179-ax-goto-ribbons 8
  ui content_size large
  step 311 180-plans 6
  step 312 181-chapter-a-day 10
  step 313 182-plan-and-ribbons 10
  # The screen recording of sequence 13.
  # (Sequence 13's setup, before the mark: review r6-1.)
  step 342 "" 10
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec0=$(now)
  # (A still lead-in: the recorder writes nothing for its first seconds;
  # review r8-1.)
  sleep 6
  : > "$out/transitions.txt"
  step 314 "" 24
  a=$(step_at 314)
  b=$(now)
  echo "13 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # Twelve ribbons, logged only: the footer, New Ribbon… and the menu's
  # item disabled; then one deleted (review r8-1).
  step 315 "" 10
  # The walk, from the log: each make, pick-up, move, put-down, move-here,
  # rename, delete and the migration (§11.6); nothing moved while put down.
  grep -h "bible: limit\|bible: ribbon\|bible: readings\|bible: chapter read\|bible: chapter heard\|bible: title menu\|bible: toast\|bible: plan\|bible: demo step\|table off the window" \
    "$out/console.txt" > "$out/ribbons.txt" 2>/dev/null
  for want in "ribbons migrated 3 of 4" "readings-r6.tsv there 1" "New Ribbon Here… · Mark 1 / Move Ribbon Here: Romans, Acts, John" \
      "ribbon made: Morning at MRK 1" "ribbon picked up: Morning" "toast Reading with Morning" \
      "Reading with Morning [Leave Morning Here / New Ribbon Here…" \
      "ribbon moved: Morning to MRK 2:5" "ribbon moved: Morning to MRK 2:3" "ribbon moved: Morning to MRK 3" \
      "ribbon put down: Morning at MRK 3" "ribbon picked up: Morning (back)" "ribbon moved: Morning to MRK 3:7" \
      "ribbon put down: Morning at MRK 3:7" "ribbon picked up: Acts" "toast Reading with Acts" \
      "chapter heard ACT 10" "ribbon moved: Acts to ACT 11" "ribbon put down: Acts at ACT 11" "toast Acts left at Acts 11" \
      "ribbon moved here: Romans to ROM 8" "toast Reading with Romans" "ribbon renamed: Morning to With Anna" \
      "ribbon deleted: John" "ribbon made: Jude at JUD 1" "toast Reading with Jude" "ribbon put down: Jude at JUD 1" \
      "toast Started Hebrews, a Chapter a Day" "limit at 12: ribbons 12, footer 12 ribbons is the most., New Ribbon… enabled 0" \
      " (disabled) / Move Ribbon Here" "limit after a delete: ribbons 11, footer none, New Ribbon… enabled 1"; do
    grep -qF "$want" "$out/ribbons.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/ribbons.txt"; failed=1; }
  done
  for bad in "ribbon moved: Acts to ACT 11:5" "ribbon made: Psalms" "ribbon moved: Morning to 1CO" "ribbon moved: Morning to ISA"; do
    grep -qF "$bad" "$out/ribbons.txt" && { echo "FAILED: \"$bad\"" | tee -a "$out/ribbons.txt"; failed=1; }
  done
  # (Put down by the search's jump: nothing moves Morning until the capsule
  # picks it up again.)
  awk '/ribbon put down: Morning at MRK 3$/ { down = 1 } /ribbon picked up: Morning \(back\)/ { down = 0 }
    down && /ribbon moved: Morning/ { print "FAILED: moved while put down: " $0; bad = 1 } END { exit bad }' "$out/ribbons.txt" \
    || { echo "FAILED: Morning moved while put down" | tee -a "$out/ribbons.txt"; failed=1; }
  tail -5 "$out/ribbons.txt"
  ;;
listen)
  # (DESIGN.md §12.7: shots 190 to 203.)
  step 320 190-listen-section 6
  step 321 191-voice 6
  step 343 191b-voice-web-esv 6
  step 344 191c-voice-downloads 6
  step 322 192-voice-list 6
  step 323 193-recording 20
  step 324 194-loading 8
  step 325 194b-loading-done 20
  step 326 195-reader-switched 24
  step 327 196-faster 6
  step 328 196b-faster-later 6
  step 329 197-next-chapter 12
  step 330 198-offline 8
  step 331 199-esv-chapter 10
  step 332 200-kjv-voice 8
  step 333 201-downloads 10
  step 334 201b-downloaded 12
  step 335 201c-downloaded-books 6
  step 336 202-ack-audio 6
  step 337 202b-ack-esv-audio 6
  ui content_size accessibility-extra-extra-extra-large
  step 338 203-ax-voice 8
  ui content_size large
  # The screen recording of sequence 14.
  step 339 "" 6
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec0=$(now)
  # (A still lead-in: the recorder writes nothing for its first seconds;
  # review r8-1.)
  sleep 6
  : > "$out/transitions.txt"
  # (Marked from the app's own start of Listen, not the step's sending:
  # review r7-1.)
  wait_start
  xcrun simctl spawn "$dev" notifyutil -p "$id.demo340"
  i=0
  while ! grep -q "bible: listen souer JHN 3 from 3:30" "$out/console.txt" 2>/dev/null && [ "$i" -lt 200 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  a=$(now)
  wait_done 340 "340" 22
  sleep 1
  b=$(now)
  echo "14 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # The log's checks (§12.7).
  grep -h "bible: listen\|bible: chapter heard\|bible: now playing\|bible: esv audio\|bible: audio\|bible: download\|bible: book downloaded\|bible: voice\|bible: demo listen\|bible: demo step\|Offline\|Loading" \
    "$out/console.txt" > "$out/listen.txt" 2>/dev/null
  for want in "bible: listen souer JHN 3 from 3:14 at 14.70 s" "bible: listen switched to hays at JHN 3:5" \
      "bible: listen rate 1.25" "bible: chapter heard JHN 3" "bible: listen next JHN 4" \
      "bible: listen fell back to voice at JHN 3:16 (souer: offline)" "bible: esv audio JHN 3 (fixture)" \
      "bible: book downloaded JHN" "bible: now playing {title: John 3, artist: Bob Souer, album: Berean Standard Bible"; do
    grep -qF "$want" "$out/listen.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/listen.txt"; failed=1; }
  done
  grep -qF "audio fixture did not advance" "$out/listen.txt" && { echo "FAILED: the fixture did not advance" | tee -a "$out/listen.txt"; failed=1; }
  tail -5 "$out/listen.txt"
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
# (No path wrote the reader's offset while it moved: go and set_offset
# refuse then, and say so; DESIGN.md §9.4.11, review r5-1.)
n=$(cat "$out"/console*.txt 2>/dev/null | grep -c "offset write while moving")
echo "offset writes refused while moving: $n" | tee "$out/moving.txt"
[ "$n" = 0 ] || failed=1
echo "total $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
kill "$logger" "$console" 2>/dev/null || true
find ~/Library/Logs/DiagnosticReports -newer "$out/.started" -type f -exec cp {} "$out"/ \; 2>/dev/null || true
ls -la "$out"
cat "$out/timing.txt"
exit "${failed:-0}"
