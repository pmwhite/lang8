#!/bin/sh
# Launch times of two builds of Smooth Bible in the iOS simulator, warm:
#   launch.sh NEW.app OLD.app OUT
# Each app is installed and launched once (the first launch is slow), then
# launched 5 times more; each time is from `simctl launch` to "bible: up" in
# its output. OUT gets each time and the medians (and NEW's own count from
# main to "bible: up", "bible: launched in ms").
set -u
new=$1
old=$2
out=$3
id=space.trailingwhite.smoothbible
dev=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in sorted(devices.items()) if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
pick = [d for d in phones if d["name"] in ("iPhone 16", "iPhone 15", "iPhone 16 Pro", "iPhone 17")] or phones
print(pick[-1]["udid"])')
xcrun simctl boot "$dev" 2>/dev/null || true
xcrun simctl bootstatus "$dev" -b >/dev/null
: > "$out"
time_launches() {
  xcrun simctl uninstall "$dev" "$id" 2>/dev/null || true
  xcrun simctl install "$dev" "$2"
  for i in 0 1 2 3 4 5; do
    xcrun simctl terminate "$dev" "$id" 2>/dev/null || true
    sleep 1
    python3 - "$dev" "$id" "$1" "$i" >> "$out" <<'PY'
import os, subprocess, sys, time
dev, app, name, i = sys.argv[1:5]
log = "/tmp/launch-%s-%s.txt" % (name, i)
t0 = time.time()
p = subprocess.Popen(["xcrun", "simctl", "launch", "--console-pty", dev, app],
    stdout=open(log, "w"), stderr=subprocess.STDOUT)
t = None
own = ""
while time.time() - t0 < 90:
    s = open(log, errors="replace").read()
    if t is None and "bible: up" in s:
        t = time.time() - t0
    if "launched in ms" in s:
        own = s.split("launched in ms")[1].split()[0]
    if t is not None and (own or time.time() - t0 > t + 1):
        break
    time.sleep(0.01)
p.kill()
if i != "0":
    print(name, round(t * 1000) if t is not None else -1, "ms", ("(own " + own + " ms)") if own else "")
PY
  done
}
time_launches new "$new"
time_launches round1 "$old"
python3 - "$out" <<'PY' | tee -a "$out"
import statistics, sys
lines = open(sys.argv[1]).read().split("\n")
for name in ("new", "round1"):
    ms = [int(l.split()[1]) for l in lines if l.startswith(name + " ")]
    if ms:
        print("median %s %d ms" % (name, statistics.median(ms)))
PY
