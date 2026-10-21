#!/bin/sh
# Run SmoothBible.app (Smooth Bible) in the iOS simulator, on a Mac, and keep what it showed:
#   simulate.sh APP OUT GROUP
# It boots an iPhone simulator, launches the app with L8_DEMO=1, and takes it
# through one group of its demo with Darwin notifications
# (space.trailingwhite.smoothbible.demoN; see demo_do in
# programs/bible/ios_demo.l8, and DESIGN.md §5 and §7.10 for what each
# screenshot should show). CI runs the groups on five Macs, two one after
# another on each, the second on the first's simulator, reset (below):
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
#           (plans-transitions.mp4); Versions and Acknowledgements
#           popped before a theme's change (1.0 (11)'s crash), checked;
#           and §16's day's reader (DESIGN.md §16.8, shots 430 to 454, the
#           Chronological followed, day 122 today, with the ESV's fixture):
#           opened from Go To, its passages, Mark Read, its end, Next, the
#           tray, a reference left and come back to, Listen through it,
#           M'Cheyne's Calendar, a passage begun mid-chapter, the reminder,
#           the ESV, 1.0's plan.tsv, a carried ribbon, Night, the largest
#           text, its title, Old and New Together, a relaunch with it up;
#           the recording of sequence 21 (days-transitions.mp4); its log's
#           checks in days.txt
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
#   memory  Round 9 (DESIGN.md §13.8.2), on the demo clock, from a
#           memory.tsv written before the first launch: the tray's Memorize
#           and Memorizing, the Library's Memory, Add Passage, a passage
#           learned in parts, a review typed and judged, Echo (ROM 8 given
#           the fixture's timings), the end, Passage, the reminder, Night,
#           the largest text; and the recording of sequence 15
#           (memory-transitions.mp4); then (review r9-1) a reminder opened
#           on a cold launch, the reminder off, an ESV pin fetched again
#           (the ESV fixture), Passage scrolled (229b) and the longest 40
#           verses at Blank (234); its log's checks in memory.txt
#   languages  Round 10 (DESIGN.md §14.9.2), on the demo clock, from a
#           memory.tsv, a highlight and a History written before the first
#           launch, no cards: the interlinear's link, the Greek page, the
#           Alphabet and letters in Practice, Add Words, words in Practice,
#           what is known hidden in John 3:16 (its tiles where they were),
#           the word study's rows, Forms, Pronunciation, Verses You Can
#           Read, Memory's rows, Hebrew, the reminder, Night, the largest
#           text, Practise Reading; and the recording of sequence 16
#           (languages-transitions.mp4); its log's checks in languages.txt
#   help    the manual and quick tips (DESIGN.md §15.7), on the demo clock,
#           from a fresh install with tips on (every other group turns
#           them off before its first launch, so their shots of Go To are
#           as they were): the first tip, Next, the same day and the next,
#           the highlight tips skipped, a tip's action and More, Reading
#           settings' Help, the Manual, a page, a link, its search, tips off
#           and on, Night, the largest text, the Greek and Hebrew and Memory
#           pages, every tip seen; and the recording of sequence 20
#           (help-transitions.mp4); its log's checks in tips.txt
#   original  Round 11 (DESIGN.md §14.11.9), on the demo clock: 120 Greek
#           words known and 300 Hebrew; Versions' Hebrew and Greek, John 1
#           glossed (words not learned, then rare words), a word's popover
#           and Learn This Word, John 3 once it is known, Genesis 1 and
#           Psalm 23 in Hebrew, Show Accents, a Qere's Ketiv, Malachi 4:1's
#           Hebrew number, Daniel 2:4's Aramaic, Listen's row, Night, the
#           largest text, a BSB highlight in Greek; the recording of
#           sequence 17 (original-transitions.mp4); its log's checks in
#           original.txt
#   ipad    §17 (DESIGN.md §17.8.2), on the 13-inch iPad Pro, tips on, a
#           Memory passage written before the first launch: the reader in
#           portrait and turned to landscape (the verse kept), at an
#           accessibility size; the tray; the sheets as form sheets,
#           Reading settings as a popover, Night seen live; Practice, a
#           card, the Greek page, the day's reader, the capsule, the mini
#           player; ⌘L; the narrow window's stand-in; the manual's keys;
#           the share popover; Study beside the text (492 to 503); the
#           recording of sequences 22 and 23 (ipad-transitions.mp4); the
#           13-inch App Store screenshots (store-ipad-1.png to 5); its
#           log's checks in ipad.txt. (Shots taken in landscape are
#           turned upright: landscape.txt names them.)
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
# (CI runs two groups one after another on a Mac, on one simulator: a boot
# costs minutes. Another simulator, booted for another group, is shut down.
# This one, if a group has used it (the app is on it), is reset as the
# group found it: the app and its defaults, permissions and keychain gone,
# the pasteboard emptied, the status bar as it was, the app's notification
# state cleared.)
# (SIM_KEEP: simulators booted ahead for a later group, left booted.)
xcrun simctl list devices booted -j | python3 -c '
import json, sys
for ds in json.load(sys.stdin)["devices"].values():
    for d in ds:
        if d["udid"] != sys.argv[1] and d["udid"] not in sys.argv[2].split():
            print(d["udid"])' "$dev" "${SIM_KEEP:-}" | while read -r other; do
  xcrun simctl shutdown "$other" 2>/dev/null && echo "shut down $other"
done
# (Crash reports from here on are this group's: not the other simulator's,
# shut down above.)
touch "$out/.started"
if xcrun simctl get_app_container "$dev" "$id" >/dev/null 2>&1; then
  xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
  xcrun simctl privacy "$dev" reset all "$id" 2>/dev/null || true
  xcrun simctl spawn "$dev" defaults delete "$id" 2>/dev/null || true
  xcrun simctl uninstall "$dev" "$id"
  xcrun simctl keychain "$dev" reset 2>/dev/null || true
  printf '' | xcrun simctl pbcopy "$dev" 2>/dev/null || true
  xcrun simctl status_bar "$dev" clear 2>/dev/null || true
  xcrun simctl spawn "$dev" notifyutil -s "$id.done" 0 2>/dev/null || true
  echo "reset after the last group in $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
fi
xcrun simctl boot "$dev" 2>/dev/null || true
# (Its boot's stages, and when each began, in timing.txt.)
xcrun simctl bootstatus "$dev" -b 2>&1 | while read -r line; do
  case "$line" in \[*) continue ;; esac
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
if [ "$group" = versions ] || [ "$group" = listen ] || [ "$group" = memory ] || [ "$group" = plans ]; then
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
# (The memory group's passages, before the first launch: Philippians
# 4:6–7 to review (box 3, due yesterday), Romans 8:28–39 learning (four
# parts, due today), Psalm 23 in the KJV later (box 4, due 2 November);
# memorySeen and memoryType off; and ROM 8 in the fixture's timings, a
# verse a half second from 2.0 s but 8:32, 12 s long, so that Echo's wash
# is still on it when 226 is taken. DESIGN.md §13.8.2.)
if [ "$group" = memory ]; then
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  if [ -n "$data" ]; then
    mkdir -p "$data/Library/Application Support/SmoothBible"
    t=$(python3 -c 'import time; print(int(time.time()) - 5 * 86400)')
    printf 'PASSAGE\t1\tbsb\tPHP\t4\t6\t4\t7\t%s\treview\t0\t3\t2026-10-18\tblank\nPASSAGE\t2\tbsb\tROM\t8\t28\t8\t39\t%s\tlearning\t4\t0\t2026-10-19\tfull\nPASSAGE\t3\tkjv\tPSA\t23\t1\t23\t6\t%s\treview\t0\t4\t2026-11-02\tblank\nNEXT\t4\n' \
      "$t" "$((t + 60))" "$((t + 120))" > "$data/Library/Application Support/SmoothBible/memory.tsv"
    { printf 'ROM\t8\t4000\t0\tok\t200'; i=1; while [ "$i" -lt 39 ]; do if [ "$i" = 32 ]; then printf ' 1200'; else printf ' 50'; fi; i=$((i + 1)); done; printf ' 30\n'; } \
      >> "$data/Library/audio-fixture/fixture.tim"
    echo "memory group's passages written"; cat "$data/Library/Application Support/SmoothBible/memory.tsv"
  fi
  xcrun simctl spawn "$dev" defaults write "$id" memorySeen -bool false 2>/dev/null || true
  xcrun simctl spawn "$dev" defaults write "$id" memoryType -bool false 2>/dev/null || true
fi
# (The languages group's, before the first launch: Philippians 4:6–7 in
# Memory, to review on 2026-10-25; a highlight on John 3:16; History with
# John 1, 2 and 3 this week; no cards; learnSeen and memorySeen off.
# DESIGN.md §14.9.2.)
if [ "$group" = languages ]; then
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  if [ -n "$data" ]; then
    mkdir -p "$data/Library/Application Support/SmoothBible"
    python3 - "$data/Library/Application Support/SmoothBible" <<'PY'
import sys, time
now = int(time.time())
day = 86400
d = sys.argv[1]
with open(d + "/memory.tsv", "w") as f:
    f.write("PASSAGE\t1\tbsb\tPHP\t4\t6\t4\t7\t%d\treview\t0\t3\t2026-10-25\tblank\nNEXT\t2\n" % (now - 9 * day))
with open(d + "/highlights.tsv", "w") as f:
    f.write("JHN\t3\t16\tyellow\t%d\n" % (now - 2 * day))
with open(d + "/history.tsv", "w") as f:
    for i, c in enumerate((1, 2, 3)):
        f.write("JHN\t%d\t1\t%d\t0\t1\n" % (c, now - (5 - i) * day))
PY
    echo "languages group's files written"; cat "$data/Library/Application Support/SmoothBible/"*.tsv
  fi
  xcrun simctl spawn "$dev" defaults write "$id" learnSeen -bool false 2>/dev/null || true
  xcrun simctl spawn "$dev" defaults write "$id" memorySeen -bool true 2>/dev/null || true
fi
# (The ipad group's, before the first launch: Philippians 4:6–7 and Romans
# 8:28–30 in Memory, for Practice; DESIGN.md §17.8.2.)
if [ "$group" = ipad ]; then
  data=$(xcrun simctl get_app_container "$dev" "$id" data 2>/dev/null)
  if [ -n "$data" ]; then
    mkdir -p "$data/Library/Application Support/SmoothBible"
    t=$(python3 -c 'import time; print(int(time.time()) - 5 * 86400)')
    printf 'PASSAGE\t1\tbsb\tPHP\t4\t6\t4\t7\t%s\treview\t0\t3\t2026-10-18\tletters\nPASSAGE\t2\tbsb\tROM\t8\t28\t8\t30\t%s\treview\t0\t2\t2026-10-18\tsome\nNEXT\t3\n' \
      "$t" "$((t + 60))" > "$data/Library/Application Support/SmoothBible/memory.tsv"
    echo "ipad group's passages written"
  fi
  xcrun simctl spawn "$dev" defaults write "$id" learnSeen -bool true 2>/dev/null || true
  xcrun simctl spawn "$dev" defaults write "$id" memorySeen -bool true 2>/dev/null || true
fi
# (The original group's: the one-time lines of Memory and cards seen.)
if [ "$group" = original ]; then
  xcrun simctl spawn "$dev" defaults write "$id" learnSeen -bool true 2>/dev/null || true
  xcrun simctl spawn "$dev" defaults write "$id" memorySeen -bool true 2>/dev/null || true
fi
# (Every group but help and ipad: no tip at the top of Go To, so that their
# shots are as they were before §15. DESIGN.md §15.7, §17.8.2.)
[ "$group" = help ] || [ "$group" = ipad ] || xcrun simctl spawn "$dev" defaults write "$id" showTips -bool false 2>/dev/null || true
# (Every other group: the server as if it were not there, L8_ESV_OFF, so
# that no shot depends on the network or shows the ESV; review r5-1.)
esv_off=1
[ "$group" = versions ] && esv_off=
[ "$group" = listen ] && esv_off=
# (memory: an ESV passage's pin fetched, then again at 31 days; review
# r9-1 Major 6. Nothing in its shots shows the ESV.)
[ "$group" = memory ] && esv_off=
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
    else
      echo "$2: timed out (state $state, expected $1)" >> "$out/timing.txt"
      # (The first time out: what the app's threads are doing, from the
      # host's sample(1) of its process, to find a hang.)
      if [ -z "${sampled:-}" ]; then
        sampled=1
        # (The simulator's app is a process of the host's; simctl writes its
        # pid to the console only as it closes.)
        pid=$(pgrep -n -f "SmoothBible.app/SmoothBible" 2>/dev/null)
        [ -n "$pid" ] && sample "$pid" 3 -file "$out/hang-sample.txt" >/dev/null 2>&1 && echo "$2: sampled $pid into hang-sample.txt" >> "$out/timing.txt"
      fi
    fi
  fi
  wait "$waiter" 2>/dev/null
}
launch() {
  events=$((events + 1))
  wait_start
  SIMCTL_CHILD_L8_DEMO=1 SIMCTL_CHILD_L8_ESV_FIXTURE=$fixture SIMCTL_CHILD_L8_ESV_OFF=$esv_off SIMCTL_CHILD_L8_AUDIO_FIXTURE=$audio_fixture xcrun simctl launch --console-pty "$dev" "$id" > "$out/$1" 2>&1 &
  console=$!
  # (The first launch may take minutes.)
  # (Or until the app says it has settled, should its console be late; and
  # when the console said it was up, and when it settled, in timing.txt.)
  i=0
  t_up=
  while [ "$i" -lt 2400 ]; do
    if [ -z "$t_up" ] && grep -q "bible: up\|Terminating app" "$out/$1" 2>/dev/null; then
      t_up=$(python3 -c "print(round($(now) - $start))")
    fi
    [ -n "$t_up" ] && break
    kill -0 "$waiter" 2>/dev/null || break
    sleep 0.1
    i=$((i + 1))
  done
  wait_done $((1000 + events)) "launch" 6
  echo "$1 up at ${t_up:-?} s, settled at $(python3 -c "print(round($(now) - $start))") s" >> "$out/timing.txt"
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
# A text size set, waiting for the app's own line that it has followed
# it (not a count of events, which another step's event can put out of
# step: review r9-1 Minor 4).
ui_size() {
  n0=$(grep -c "bible: text size changed" "$out/console.txt" 2>/dev/null)
  xcrun simctl ui "$dev" content_size "$1" 2>/dev/null || true
  i=0
  while [ "$(grep -c "bible: text size changed" "$out/console.txt" 2>/dev/null)" -le "$n0" ] && [ "$i" -lt 200 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  [ "$i" -lt 200 ] || echo "ui content_size $1: no size line" >> "$out/timing.txt"
  sleep 1.5
}
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
  awk -v want="bible: demo step $1" '{ sub(/\r$/, "") } $0 == want { found = 1; next } found && /at unix ms/ { t = $NF; found = 0 } END { printf "%.3f", t / 1000 }' "$out/console.txt"
}
if [ "$group" = store ] || [ "$group" = ipad ]; then
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
  # The title changed in place (owner, 2026-10-19): John 4's row 8 points
  # short of the bar's bottom (John 3 named), then 8 points past it (John
  # 4), expanded and compact; console.txt has the "bible: title" changes and
  # "bible: title shows" at each.
  step 262 15d-title-before
  step 263 15e-title-after
  step 264 15f-title-compact-before
  step 265 15g-title-compact-after
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
  # (DESIGN.md §17.8.3: the iPhone held sideways, John 3 in a column of 34
  # em or less, centred, light and at the default size; the tray; then
  # upright again.)
  xcrun simctl ui "$dev" appearance light 2>/dev/null || true
  xcrun simctl ui "$dev" content_size large 2>/dev/null || true
  sleep 2
  step 590 "" 8
  sleep 1
  shot 490-iphone-landscape
  echo 490-iphone-landscape >> "$out/landscape.txt"
  step 591 491-iphone-landscape-tray
  echo 491-iphone-landscape-tray >> "$out/landscape.txt"
  step 592 "" 6
  sleep 1
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
  # §16, the day's reader (DESIGN.md §16.8): shots 430 to 454, the
  # Chronological followed from 121 days before (day 122 today).
  step 480 "" 8
  step 481 430-plans-list 8
  step 482 431-chrono-detail 6
  step 483 432-goto-today 6
  step 484 433-day-open 10
  step 485 434-day-scrolled 6
  step 486 435-mark-read 6
  step 487 436-day-end 6
  step 488 437-day-done 6
  step 489 438-next-day 8
  step 490 439-tray-in-day 6
  step 491 440-preview-leave 10
  step 492 441-back-to-day 8
  step 493 442-listen-day 10
  step 494 443-listen-crossing 12
  step 495 444-mcheyne-day 12
  step 496 445-partial 8
  step 497 446-reminder-day 8
  step 498 447-esv-day 10
  # The screen recording of sequence 21 (days-transitions.mp4): Go To up
  # before the mark; the day up from its row, a passage crossed, Mark Read,
  # the end, Next, Done.
  step 507 "" 8
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/days-transitions.mp4" > "$out/days-record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/days-record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  # (A still lead-in: the recorder writes nothing for its first seconds.)
  sleep 6
  : > "$out/days-transitions.txt"
  step 508 "" 24
  a=$(step_at 508)
  b=$(now)
  echo "21 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/days-transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  step 499 448-old-file 8
  step 500 449-ribbon-untouched 12
  step 501 450-night-day 8
  step 502 "" 6
  ui content_size accessibility-extra-extra-extra-large
  step 503 451-ax-day 8
  ui content_size large
  step 504 452-day-title 8
  step 505 453-both 8
  step 506 "" 8
  # 454: the app shut with the day's reader up, and launched again.
  xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
  kill "$console" 2>/dev/null || true
  events=0
  launch console-again.txt
  shot 454-relaunch
  # §16.11, several plans at once: the Chronological, then M'Cheyne's
  # started beside it (shots 455 to 459b; 459 is the log's).
  step 509 "" 8
  step 510 459b-start-second 10
  step 511 "" 10
  step 512 455-goto-two-plans 8
  step 513 456-plans-following 8
  step 514 457-day-end-also 10
  step 515 458-also-today-open 8
  step 516 "" 6
  # The day's reader's log, checked (days.txt).
  cat "$out/console.txt" "$out/console-again.txt" 2>/dev/null | grep -a "bible: day \|bible: demo chronological\|bible: left the day\|bible: ribbon \|bible: 1.0 day state\|bible: sequence 21\|bible: started\|bible: plans migrated\|bible: reminder first\|bible: also today\|bible: plan started\|bible: plan archived" > "$out/days.txt"
  cat "$out/days.txt"
  for want in "bible: demo chronological, today day 122" "bible: day open 6 122" "bible: day title " \
    "bible: day passage read .* (by hand)" "bible: day marked read 122" "bible: day replaced 6 123" \
    "bible: left the day for .*, the capsule to its day" "bible: day passage heard " "bible: day passage read .* (by itself)" \
    "bible: day replaced 6 109" "bible: day esv rows filled" "bible: 1.0 day state x10 11" "bible: 1.0 day state x10 22" \
    "bible: 1.0 day state x10 31" "bible: ribbon unmoved by the day, the reader where it was" "bible: day reopened at launch" \
    "bible: sequence 21 part 5" "bible: plans migrated 1" "bible: day also today, plan 5" \
    "bible: also today from the Chronological 1" "bible: reminder first: Today’s Reading | Chronological: "; do
    grep -q "$want" "$out/days.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/days.txt"; failed=1; }
  done
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
  # (The video's time 0 is the recorder's launch, not its "started",
  # which comes some 4.7 s later: the marks are from the launch; review
  # r8-1.)
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
  # (A still lead-in: the recorder writes nothing for its first seconds;
  # review r8-1.)
  sleep 6
  : > "$out/transitions.txt"
  step 314 "" 24
  a=$(step_at 314)
  b=$(now)
  echo "13 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  echo "13 from-started $(python3 -c "print(round($a - $rec1, 2), round($b - $rec1, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # Twelve ribbons, logged only: the footer, New Ribbon… and the menu's
  # item disabled; then one deleted (review r8-1).
  step 315 "" 10
  # The ribbon's glyph, before and after; the carried ribbon by the title
  # at Song of Solomon 8, expanded and compact, at the default and the
  # largest text, then put down (owner, 2026-10-19).
  step 316 183-glyph-before-after 6
  step 350 184-carried-long-title 10
  step 351 185-carried-compact 6
  ui content_size accessibility-extra-extra-extra-large
  step 352 186-carried-ax 6
  step 353 187-carried-ax-compact 6
  step 354 188-not-carried-ax-compact 6
  step 355 189-not-carried-ax 6
  ui content_size large
  # Each ribbon's color (owner, 2026-10-19): Go To with several; New
  # Ribbon's and Ribbon's swatches (Romans given Green); the title's glyph
  # in two colors; Night.
  step 356 183a-goto-colors 6
  step 357 183b-new-ribbon-colors 8
  step 358 183c-ribbon-colors 8
  step 359 183d-indicator-green 8
  step 360 183e-indicator-navy 8
  step 361 183f-goto-night 8
  step 362 183g-indicator-night 6
  step 363 "" 6
  # The walk, from the log: each make, pick-up, move, put-down, move-here,
  # rename, delete and the migration (§11.6); nothing moved while put down.
  grep -h "bible: limit\|bible: ribbon\|bible: readings\|bible: chapter read\|bible: chapter heard\|bible: title\|bible: toast\|bible: plan\|bible: demo step\|table off the window" \
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
      " (disabled) / Move Ribbon Here" "title ribbon shown 1" "title ribbon shown 0" "title Song of Solomon 8, ribbon shown 1" "ribbon color: Romans Green" "ribbon shown 1 (Romans, Green)" "ribbon shown 1 (Jude, Navy)" "limit after a delete: ribbons 11, footer none, New Ribbon… enabled 1"; do
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
  # (A narrator changed mid-chapter, playing and paused: the same verse
  # kept; owner, 2026-10-19.)
  step 345 197b-switch-playing 20
  step 346 197c-switch-paused 8
  step 347 197d-switch-resumed 8
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
  # (The video's time 0 is the recorder's launch, not its "started",
  # which comes some 4.7 s later: the marks are from the launch; review
  # r8-1.)
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
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
  echo "14 from-started $(python3 -c "print(round($a - $rec1, 2), round($b - $rec1, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # The log's checks (§12.7).
  grep -h "bible: listen\|bible: chapter heard\|bible: now playing\|bible: esv audio\|bible: audio\|bible: download\|bible: book downloaded\|bible: voice\|bible: demo listen\|bible: demo step\|Offline\|Loading" \
    "$out/console.txt" > "$out/listen.txt" 2>/dev/null
  for want in "bible: listen souer JHN 3 from 3:14 at 14.70 s" "bible: listen switched to hays at JHN 3:5" \
      "bible: listen rate 1.25" "bible: chapter heard JHN 3" "bible: listen next JHN 4" \
      "bible: listen fell back to voice at JHN 3:16 (souer: offline)" "bible: esv audio JHN 3 (fixture)" \
      "bible: book downloaded JHN" "bible: now playing {title: John 3, artist: Bob Souer, album: Berean Standard Bible" \
      "bible: listen switch from souer to gilbert at JHN 3:8, playing" "to hays at JHN 3:" ", paused"; do
    grep -qF "$want" "$out/listen.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/listen.txt"; failed=1; }
  done
  grep -qF "audio fixture did not advance" "$out/listen.txt" && { echo "FAILED: the fixture did not advance" | tee -a "$out/listen.txt"; failed=1; }
  tail -5 "$out/listen.txt"
  ;;
memory)
  # (DESIGN.md §13.8.2: shots 210 to 233.)
  step 370 210-tray-memorize 6
  step_toast 371 211-memorize-toast "Added to Memory"
  step 372 212-tray-memorizing 6
  step 373 213-library-memory 8
  step 374 214-add-passage 8
  step 375 215-learn-full 8
  step 376 216-learn-some 6
  step 377 217-learn-letters 6
  step 378 218-learn-blank 6
  step 379 219-show-word 6
  step 380 220-learn-checked 6
  step 381 221-learn-joined 10
  step 382 222-review-type 10
  step 383 223-judgement 6
  step 384 224-touch-down 6
  step 385 225-learn-romans 6
  step 386 226-echo 6
  step 387 226b-echo-pause 6
  step 388 227-done-today 10
  step 389 228-library-after 8
  step 390 229-passage 6
  step 398 229b-passage-end 6
  step 391 230-reminder 8
  step 392 231-night-letters 10
  ui_size accessibility-extra-extra-extra-large
  step 393 232-ax-practice 10
  step 394 233-ax-memory 8
  ui_size large
  # The screen recording of sequence 15 (its setup before the mark).
  step 395 "" 8
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
  sleep 6
  : > "$out/transitions.txt"
  step 396 "" 20
  a=$(step_at 396)
  b=$(now)
  echo "15 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  echo "15 from-started $(python3 -c "print(round($a - $rec1, 2), round($b - $rec1, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  step 397 "" 14
  # (Review r9-1 Major 5: the BSB's longest 40 verses at Blank.)
  step 399 234-long-passage 15
  # The log's checks (§13.8.2): each add, part, grade and schedule; the
  # words in the same places at every level, reveal and Check.
  grep -h "bible: memory\|bible: practice\|bible: reminder\|bible: scheduled\|bible: tray titles\|bible: add passage\|bible: toast\|bible: demo step\|bible: demo echo\|bible: demo memorizing\|bible: opened Library\|bible: esv pin\|bible: demo esv\|Next review\|Again tomorrow" \
    "$out/console.txt" > "$out/memory.txt" 2>/dev/null
  for want in "memory added: JHN 3:16-17 bsb" "toast Added to Memory" "add passage footer Isaiah 52:13" ", 15, Add enabled" \
      "memory part: JHN 3:16-17 1 of 2" "memory part: JHN 3:16-17 2 of 2" "memory learned: JHN 3:16-17 box 1 due 2026-10-20" \
      "practice checked, helps 0, misses 1, suggested mostly" "Next review 2 November" \
      "memory graded: PHP 4:6-7 mostly box 3" "due 2026-10-26" "practice warm-up ROM 8:28-39" \
      "memory echo verse ROM 8:32" "memory echo pause ROM 8:32" "memory part: ROM 8:28-39 5 of 12" "practice end" \
      "reminders 30 days from 2026-10-20 07:00" "reminder first:" \
      "memory reminder opened" "opened Library on Memory" "memory reminder off" "reminders 0 pending" "esv pin refetched" "memory esv verses kept"; do
    grep -qF "$want" "$out/memory.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/memory.txt"; failed=1; }
  done
  # (215 to 220: one layout.)
  n=$(grep "practice layout" "$out/memory.txt" | head -6 | awk '{print $NF}' | sort -u | wc -l | tr -d ' ')
  echo "layouts of 215-220: $n different" | tee -a "$out/memory.txt"
  [ "$n" = 1 ] || { echo "FAILED: the words moved between 215 and 220" | tee -a "$out/memory.txt"; failed=1; }
  # (234: every word of the long passage underlined.)
  long=$(grep "practice long passage" "$out/memory.txt" | tail -1)
  w=$(echo "$long" | sed -n 's/.*words \([0-9]*\), underlines \([0-9]*\).*/\1/p')
  u=$(echo "$long" | sed -n 's/.*words \([0-9]*\), underlines \([0-9]*\).*/\2/p')
  echo "long passage: ${w:-?} words, ${u:-?} underlines" | tee -a "$out/memory.txt"
  [ -n "$w" ] && [ "$w" -gt 1024 ] && [ "$w" = "$u" ] || { echo "FAILED: the long passage's underlines" | tee -a "$out/memory.txt"; failed=1; }
  tail -5 "$out/memory.txt"
  ;;
languages)
  # (DESIGN.md §14.9.2: shots 240 to 269; §14.10b.5: 246b and 249b.)
  step 400 240-interlinear-link 10
  step 401 241-greek-new 8
  step 402 242-alphabet 6
  step 403 243-letter-new 8
  step 404 244-letter-check 6
  step 405 245-letter-judgement 6
  step 406 246-add-words 10
  step 407 247-add-preview 6
  step 408 248-word-new 10
  step 409 249-word-front 10
  step 436 249b-word-answer 6
  step 410 250-greek-started 10
  step 435 246b-add-related 8
  step 411 251-interlinear-hidden 10
  step 412 252-tile-shown 6
  step 413 253-word-study-yours 8
  step 414 254-forms 6
  step 415 255-forms-conc 6
  step 416 256a-pronunciation-list 8
  step 417 256-pronunciation 8
  step 418 257-readable 8
  step 419 258-readable-open 8
  step 420 259-memory 10
  step 421 260-passage-words 8
  step 422 261-hebrew-alphabet 10
  step 423 262-hebrew-joined 10
  step 424 263-hebrew-hidden 12
  step 425 264-hebrew-forms 10
  step 426 265-reminder 10
  step 427 266-night-card 10
  ui content_size accessibility-extra-extra-extra-large
  step 428 267-ax-card 8
  step 429 268-ax-forms 12
  ui content_size large
  step 430 269-reading-practice 12
  # The screen recording of sequence 16 (its setup before the mark).
  step 431 "" 10
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
  sleep 2
  : > "$out/transitions.txt"
  step 432 "" 20
  sleep 13
  a=$(step_at 432)
  b=$(now)
  echo "16 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  echo "16 from-started $(python3 -c "print(round($a - $rec1, 2), round($b - $rec1, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  step 433 "" 6
  # The log's checks (§14.9.2): the data's figures, cards added, known and
  # graded, the hiding, the reminder; John 3:16's tiles where they were
  # (251 against 240).
  grep -h "bible: learn\|bible: interlinear tiles\|bible: practice\|bible: reminder\|bible: scheduled\|bible: toast\|bible: demo step\|bible: demo learn\|Next review\|Again tomorrow\|That’s" \
    "$out/console.txt" > "$out/languages.txt" 2>/dev/null
  for want in "learn added G:alpha from alphabet" "learn shown G:alpha new" "learn card G:alpha knew box 1→2" \
      "learn preview most common, words 10" "toast 10 words added" "learn added G3588 from freq" "learn shown G3588 new, context PHP 4:7" \
      "learn known G3588 box 4" "learn hide JHN 3:16 known 21 of 25 translit hidden" "learn shown in the interlinear ēgapēsen" \
      "learn forms G25" "learn pronunciation 1" "learn readable" "learn hide PSA 23:1" "learn answer G3004" "learn add words, related" \
      "learn practise reading, words 10" "reminder first:"; do
    grep -qF "$want" "$out/languages.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/languages.txt"; failed=1; }
  done
  # (251's tiles in 240's places.)
  t240=$(grep "interlinear tiles JHN 3:16 original" "$out/languages.txt" | head -1 | awk '{print $NF}')
  t251=$(grep "interlinear tiles JHN 3:16 original" "$out/languages.txt" | sed -n 2p | awk '{print $NF}')
  echo "John 3:16's tiles: 240 $t240, 251 $t251" | tee -a "$out/languages.txt"
  [ -n "$t240" ] && [ "$t240" = "$t251" ] || { echo "FAILED: the tiles moved between 240 and 251" | tee -a "$out/languages.txt"; failed=1; }
  grep -q "reminder first:.*Greek word" "$out/languages.txt" || { echo "FAILED: the reminder has no Greek words" | tee -a "$out/languages.txt"; failed=1; }
  # (No synthesized Greek or Hebrew, §14.10b.1.)
  if grep -q "learn voice\|learn speak" "$out/languages.txt"; then echo "FAILED: Greek or Hebrew spoken" | tee -a "$out/languages.txt"; failed=1; fi
  tail -5 "$out/languages.txt"
  ;;
help)
  # (DESIGN.md §15.7: shots 400 to 419.)
  step 440 400-tip-first 10
  step 441 401-tip-next 6
  step 442 402-tip-same-day 8
  step 443 403-tip-next-day 8
  step 444 404-tip-skipped 8
  step 445 405-tip-action 10
  step 446 406-tip-more 8
  step 447 407-manual 10
  step 448 408-manual-contents 8
  step 449 409-manual-page 8
  step 450 410-manual-link 8
  step 451 411-manual-search 8
  step 452 412-tips-off 8
  step 453 413-tips-on 8
  step 454 414-night 8
  step 455 414b-night-page 8
  ui content_size accessibility-extra-extra-extra-large
  step 456 415-ax-tip 10
  step 457 416-ax-page 8
  ui content_size large
  step 458 417-languages-page 12
  step 459 418-memory-page 8
  step 460 419-wrap 8
  # The screen recording of sequence 20 (its setup before the mark).
  step 461 "" 8
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
  sleep 2
  : > "$out/transitions.txt"
  step 462 "" 20
  sleep 7
  a=$(step_at 462)
  b=$(now)
  echo "20 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  echo "20 from-started $(python3 -c "print(round($a - $rec1, 2), round($b - $rec1, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  step 463 "" 6
  # The log's checks (§15.7): the tips shown and why, the buttons, the
  # Manual's pages, link and search, the switch; nothing wrong in help.txt.
  grep -h "bible: tip\|bible: help\|bible: manual\|bible: show tips\|bible: new ribbon at\|bible: demo step\|bible: demo link\|bible: demo every" \
    "$out/console.txt" > "$out/tips.txt" 2>/dev/null
  for want in "tip shown goto-type (level 1, day 2026-10-19)" "tip next → tap-select" "tip shown tap-select (level 1, day 2026-10-19)" \
      "tip shown highlight (level 1, day 2026-10-20)" "tips skipped tap-select (highlight), highlight (highlight)" \
      "tip shown note (level 1, day 2026-10-21)" "tip action new-ribbon" "new ribbon at" "tip more ribbons#making" \
      "manual washed ribbons#making" "manual page tray" "manual link memory#adding" \
      "manual search ribbon: going#goto, ribbons#about, ribbons#making, ribbons#carry, ribbons#edit" \
      "show tips off" "show tips on" "manual page languages" "manual page memory" "demo every tip seen"; do
    grep -qF "$want" "$out/tips.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/tips.txt"; failed=1; }
  done
  # (Every tip seen: one is still shown, the first not skipped.)
  grep -A3 "demo every tip seen" "$out/tips.txt" | grep -q "tip shown goto-type" || { echo "FAILED: no tip after every tip was seen" | tee -a "$out/tips.txt"; failed=1; }
  grep -q "help problems" "$out/tips.txt" && { echo "FAILED: help.txt has problems" | tee -a "$out/tips.txt"; failed=1; }
  tail -5 "$out/tips.txt"
  ;;
ipad)
  # (DESIGN.md §17.8.2: shots 460 to 489 and 492 to 503, landscape unless
  # in portrait; landscape.txt names those turned, to be set upright.) The
  # iPad is turned through Simulator's Device menu (an app that supports
  # multitasking can't turn an iPad itself): Simulator opened on it, and
  # its Rotate Left or Rotate Right clicked (System Events); rotate.txt
  # says how each went. A shot is named in landscape.txt only if the turn
  # to landscape went.
  sim_open=
  turned=
  rotate() {
    if [ -z "$sim_open" ]; then
      sim_open=1
      open -a Simulator --args -CurrentDeviceUDID "$dev" >> "$out/rotate.txt" 2>&1
      i=0
      while ! pgrep -xq Simulator && [ "$i" -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
      sleep 5
    fi
    item="Rotate Left"
    [ "$1" = right ] && item="Rotate Right"
    if osascript -e 'tell application "Simulator" to activate' \
        -e "tell application \"System Events\" to tell process \"Simulator\" to click menu item \"$item\" of menu \"Device\" of menu bar item \"Device\" of menu bar 1" >> "$out/rotate.txt" 2>&1; then
      echo "rotated $1 at $(python3 -c "print(round($(now) - $start))") s" >> "$out/rotate.txt"
      if [ "$1" = left ]; then turned=1; else turned=; fi
    else
      echo "rotate $1 failed" >> "$out/rotate.txt"
    fi
    sleep 2
  }
  land() { [ -n "$turned" ] && echo "$1" >> "$out/landscape.txt"; }
  step 520 460-ipad-portrait 10
  rotate left
  step 521 461-ipad-landscape 8; land 461-ipad-landscape
  ui_size accessibility-extra-large
  step 522 462-ipad-largest-text 8; land 462-ipad-largest-text
  ui_size large
  step 523 463-ipad-tray 8; land 463-ipad-tray
  step 524 464-ipad-goto 10; land 464-ipad-goto
  step 525 465-ipad-goto-grid 8; land 465-ipad-goto-grid
  step 526 466-ipad-search 10; land 466-ipad-search
  step 527 467-ipad-settings-popover 10; land 467-ipad-settings-popover
  step 528 468-ipad-theme-live 8; land 468-ipad-theme-live
  step 566 468b-ipad-settings-black 8; land 468b-ipad-settings-black
  step 529 469-ipad-study 12; land 469-ipad-study
  step 530 470-ipad-word-study 8; land 470-ipad-word-study
  step 531 471-ipad-compare 10; land 471-ipad-compare
  step 532 472-ipad-library-memory 10; land 472-ipad-library-memory
  step 533 473-ipad-practice 10; land 473-ipad-practice
  step 534 474-ipad-card 10; land 474-ipad-card
  step 535 475-ipad-greek-page 12; land 475-ipad-greek-page
  step 536 476-ipad-day-reader 12; land 476-ipad-day-reader
  step 537 477-ipad-capsule 10; land 477-ipad-capsule
  step 538 478-ipad-listen 10; land 478-ipad-listen
  step 539 479-ipad-menu-bar 6; land 479-ipad-menu-bar
  step 540 480-ipad-key-goto 10; land 480-ipad-key-goto
  step 541 481-ipad-narrow 12; land 481-ipad-narrow
  step 542 482-ipad-narrow-tray 8; land 482-ipad-narrow-tray
  step 543 483-ipad-landscape-practice 12; land 483-ipad-landscape-practice
  step 544 484-ipad-preview 10; land 484-ipad-preview
  step 545 485-ipad-manual 12; land 485-ipad-manual
  step 546 486-ipad-night 8; land 486-ipad-night
  ui_size accessibility-medium
  step 547 487-ipad-sepia-ax 8; land 487-ipad-sepia-ax
  ui_size large
  step 548 488-ipad-note 10; land 488-ipad-note
  step 549 489-ipad-share 10; land 489-ipad-share
  # Study beside the text.
  step 550 492-beside-open 12; land 492-beside-open
  step 551 493-beside-word 8; land 493-beside-word
  step 552 494-beside-hidden 10; land 494-beside-hidden
  step 553 495-beside-select 8; land 495-beside-select
  step 554 496-beside-scroll 8; land 496-beside-scroll
  step 555 497-beside-show-in-text 10; land 497-beside-show-in-text
  step 556 498-beside-references 8; land 498-beside-references
  rotate right
  step 557 499-beside-portrait 8
  step 558 500-beside-narrowed 10
  step 559 501-beside-back 10
  rotate left
  step 560 502-beside-day 12; land 502-beside-day
  step 561 503-beside-closed 10; land 503-beside-closed
  # The 13-inch App Store screenshots (§17.8.4), from these.
  for pair in 1:461-ipad-landscape 2:464-ipad-goto 3:492-beside-open 4:473-ipad-practice 5:475-ipad-greek-page; do
    cp "$out/${pair#*:}.png" "$out/store-ipad-${pair%%:*}.png" 2>/dev/null && land "store-ipad-${pair%%:*}"
  done
  # The screen recording of sequences 22 and 23 (its setup before each mark).
  rotate right
  step 565 "" 8
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
  sleep 2
  : > "$out/transitions.txt"
  # (22: turned to landscape and back, then the app's steps, which settle
  # once the last is made.)
  a=$(now)
  rotate left
  sleep 1
  rotate right
  step 562 "" 30
  sleep 1
  b=$(now)
  echo "22 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  rotate left
  step 563 "" 10
  sleep 1
  step 564 "" 30
  a=$(step_at 564)
  sleep 1
  b=$(now)
  echo "23 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # The log's checks (§17.8.2): the place kept at each turn, the forms of
  # the sheets, the menu's commands, Study beside the text's states.
  grep -h "bible: width\|bible: column\|bible: sheet as\|bible: menu\|bible: demo menu\|bible: study beside\|bible: demo rotate\|bible: demo narrow\|bible:   wide\|bible: key\|bible: go to field\|bible: demo step\|bible: demo sequence\|bible: popover style" \
    "$out/console.txt" > "$out/ipad.txt" 2>/dev/null
  for want in "kept JHN 3:16" "sheet as a form sheet 540 x 720" "sheet as a popover 375 x 640" "sheet as a form sheet 700 x 860" \
      "demo menu Go: Go To…, Search…, Next Chapter, Previous Chapter, Back, Library" "key go to" "go to field active" \
      "study beside: shown John 3:16" "study beside: verse John 3:17" "study beside: show in text" \
      "study beside: hidden (width)" "study beside: screens 2" "popover style 2" "study beside: closed" "demo sequence 22 done" "demo sequence 23 done"; do
    grep -qF "$want" "$out/ipad.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/ipad.txt"; failed=1; }
  done
  tail -5 "$out/ipad.txt"
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
original)
  # (DESIGN.md §14.11.9: shots 270 to 295.)
  step 600 270-versions 12
  step 601 271-john-1-greek 12
  step 602 272-rare-words 8
  step 603 273-popover 10
  step_toast 604 274-learn-toast "Added to Greek Words"
  step 605 275-john-3-learned 12
  step 606 276-genesis-1-hebrew 10
  step 607 277-psalm-23 8
  step 608 278-accents 10
  step 609 279-qere 12
  step 610 280-malachi-4 12
  step 611 281-daniel-aramaic 8
  step 612 282-listen-greek 10
  step 613 283-listen-hebrew 10
  step_toast 614 284-memorize "Added to Memory"
  step 615 285-practice-letters 12
  step 616 286-type-hebrew 10
  step 617 287-type-greek 14
  step 618 288-search-agape 12
  step 619 289-search-shalom 10
  step 620 290-compare 12
  step 627 291-share-hebrew 12
  step 628 294-greek-page 12
  step 629 294b-read-in-greek 10
  step 621 292-night-hebrew 10
  ui content_size accessibility-extra-extra-extra-large
  step 622 293-ax-greek 12
  ui content_size large
  step 624 295-highlight-in-greek 12
  # The screen recording of sequence 17 (its setup before the mark).
  step 625 "" 8
  rec0=$(now)
  xcrun simctl io "$dev" recordVideo --codec h264 --force "$out/transitions.mp4" > "$out/record.txt" 2>&1 &
  recorder=$!
  i=0
  while ! grep -qi "started" "$out/record.txt" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.05
    i=$((i + 1))
  done
  rec1=$(now)
  sleep 2
  : > "$out/transitions.txt"
  step 626 "" 12
  sleep 9
  a=$(step_at 626)
  b=$(now)
  echo "17 $(python3 -c "print(round($a - $rec0, 2), round($b - $rec0, 2))")" >> "$out/transitions.txt"
  echo "17 from-started $(python3 -c "print(round($a - $rec1, 2), round($b - $rec1, 2))")" >> "$out/transitions.txt"
  sleep 0.5
  kill -INT "$recorder" 2>/dev/null
  wait "$recorder" 2>/dev/null
  # The log's checks (§14.11.9): the glosses by chapter and mode, the
  # popovers, a card learned and the reader laid out again, Show Accents,
  # no Listen for the original.
  grep -h "bible: orig\|bible: toast\|bible: listen\|bible: demo step\|bible: demo learn\|bible: demo no\|bible: letter keyboard\|bible: learn read in\|bible: practice" \
    "$out/console.txt" > "$out/original.txt" 2>/dev/null
  for want in "orig words mapped" "orig JHN 1 glossed" "(words I haven't learned)" "(rare words)" "orig popover" \
      "toast Added to Greek Words" "orig relaid after cards changed" "orig GEN 1 glossed" "orig PSA 23 glossed" \
      "orig accents on" "orig MAL 4 glossed" "orig DAN 2 glossed" "listen none for the original" \
      "toast Added to Memory" "letter keyboard hebrew" "letter keyboard greek" "orig search found" \
      "learn read in greek"; do
    grep -qF "$want" "$out/original.txt" || { echo "FAILED: no \"$want\"" | tee -a "$out/original.txt"; failed=1; }
  done
  if grep -q "demo no apparatus entry" "$out/original.txt"; then echo "FAILED: an apparatus entry not found" | tee -a "$out/original.txt"; failed=1; fi
  tail -5 "$out/original.txt"
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
