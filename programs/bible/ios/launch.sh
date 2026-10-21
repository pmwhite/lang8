#!/bin/sh
# Launch times of two builds of Smooth Bible in the iOS simulator, warm:
#   launch.sh NEW.app OLD.app OUT
# OLD has a bundle id of its own (so both are installed at once). Each is
# launched twice to warm up, then they take turns for 8 launches each; each
# time is from `simctl launch` to "bible: up" in its output. OUT gets each
# time and the medians (and NEW's own count from main to "bible: up",
# "bible: launched in ms"). The app is launched with L8_TIMING=1, which
# lets it write those lines (a plain launch writes none).
set -u
new=$1
old=$2
out=$3
dev=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in sorted(devices.items()) if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
pick = [d for d in phones if d["name"] in ("iPhone 16", "iPhone 15", "iPhone 16 Pro", "iPhone 17")] or phones
print(pick[-1]["udid"])')
xcrun simctl boot "$dev" 2>/dev/null || true
xcrun simctl bootstatus "$dev" -b >/dev/null
xcrun simctl install "$dev" "$new"
xcrun simctl install "$dev" "$old"
idof() { /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$1/Info.plist"; }
python3 - "$dev" "$(idof "$new")" "$(idof "$old")" <<'PY' | tee "$out"
import os, statistics, subprocess, sys, time
dev, new, old = sys.argv[1:4]
def once(app, tag):
    subprocess.run(["xcrun", "simctl", "terminate", dev, app], capture_output=True)
    time.sleep(1.5)
    log = "/tmp/launch-%s.txt" % tag
    t0 = time.time()
    p = subprocess.Popen(["xcrun", "simctl", "launch", "--console-pty", dev, app],
        stdout=open(log, "w"), stderr=subprocess.STDOUT,
        env=dict(os.environ, SIMCTL_CHILD_L8_TIMING="1"))
    t, own = None, ""
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
    subprocess.run(["xcrun", "simctl", "terminate", dev, app], capture_output=True)
    return (round(t * 1000) if t is not None else -1), own
for app in (new, old, new, old):
    once(app, "warm")
times = {"new": [], "round1": []}
for i in range(8):
    for name, app in (("new", new), ("round1", old)):
        ms, own = once(app, name)
        times[name].append(ms)
        print(name, ms, "ms", ("(own " + own + " ms)") if own else "", flush=True)
for name in ("new", "round1"):
    print("median %s %d ms" % (name, statistics.median(times[name])))
a, b = statistics.median(times["new"]), statistics.median(times["round1"])
print("new / round1 = %.3f" % (a / b))
PY
