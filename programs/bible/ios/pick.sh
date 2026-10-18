#!/bin/sh
# The simulator for a group of the demo (its udid), on a Mac:
#   pick.sh GROUP
# store: the largest iPhone (17 Pro Max, else 16 Pro Max), for the App
# Store's 6.9-inch screenshots. ios18: an iPhone on an iOS 18 runtime, if the
# Mac has one (nothing printed if not). Any other: an iPhone 16 (15, 16 Pro
# or 17) on the newest runtime.
xcrun simctl list devices available -j | python3 -c '
import json, sys
group = sys.argv[1]
devices = json.load(sys.stdin)["devices"]
runtimes = sorted(devices.items(), key=lambda kv: [int(x) if x.isdigit() else 0 for x in kv[0].split("-")[-2:]])
phones = [(rt, d) for rt, ds in runtimes if "iOS" in rt for d in ds if d["name"].startswith("iPhone")]
if group == "ios18":
    phones = [(rt, d) for rt, d in phones if "iOS-18" in rt]
    names = ("iPhone 16", "iPhone 15", "iPhone 16 Pro")
elif group == "store":
    names = ("iPhone 16 Pro Max", "iPhone 17 Pro Max")
else:
    names = ("iPhone 16", "iPhone 15", "iPhone 16 Pro", "iPhone 17")
pick = [d for rt, d in phones if d["name"] in names] or [d for rt, d in phones]
if group == "store":
    best = [d for rt, d in phones if d["name"] == "iPhone 17 Pro Max"] or [d for rt, d in phones if d["name"] == "iPhone 16 Pro Max"]
    pick = best or pick
if pick:
    print(pick[-1]["udid"])
' "$1"
