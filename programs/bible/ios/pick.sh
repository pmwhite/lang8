#!/bin/sh
# The simulator for a group of the demo (its udid), on a Mac:
#   pick.sh GROUP
# store: the largest iPhone (17 Pro Max, else 16 Pro Max), for the App
# Store's 6.9-inch screenshots. ios18: an iPhone on an iOS 18 runtime, if the
# Mac has one (nothing printed if not). Any other: an iPhone 16 (15, 16 Pro
# or 17). ipad: the 13-inch iPad Pro (M4, else M5, else any 13-inch iPad;
# DESIGN.md §17.8.2). Every group but ios18 runs on iOS 26.2 (the runtime the runners
# have installed, and the SDK the app is linked with: iOS 26's design), or
# else the newest iOS 26, or else the newest runtime, so the groups agree
# and nothing is downloaded.
xcrun simctl list devices available -j | python3 -c '
import json, sys
group = sys.argv[1]
devices = json.load(sys.stdin)["devices"]
runtimes = sorted(devices.items(), key=lambda kv: [int(x) if x.isdigit() else 0 for x in kv[0].split("-")[-2:]])
phones = [(rt, d) for rt, ds in runtimes if "iOS" in rt for d in ds if d["name"].startswith("iPhone")]
if group == "ipad":
    phones = [(rt, d) for rt, ds in runtimes if "iOS" in rt for d in ds if d["name"].startswith("iPad") and "13-inch" in d["name"]]
    names = ("iPad Pro 13-inch (M4)", "iPad Pro 13-inch (M5)")
elif group == "ios18":
    phones = [(rt, d) for rt, d in phones if "iOS-18" in rt]
    names = ("iPhone 16", "iPhone 15", "iPhone 16 Pro")
elif group == "store":
    names = ("iPhone 16 Pro Max", "iPhone 17 Pro Max")
else:
    names = ("iPhone 16", "iPhone 15", "iPhone 16 Pro", "iPhone 17")
if group != "ios18":
    for want in ("iOS-26-2", "iOS-26-"):
        chosen = [(rt, d) for rt, d in phones if rt.endswith(want) or want.endswith("-") and want in rt]
        if chosen:
            phones = chosen
            break
pick = [d for rt, d in phones if d["name"] in names] or [d for rt, d in phones]
if group == "ipad":
    pick = [d for rt, d in phones if d["name"] == names[0]] or pick
if group == "store":
    best = [d for rt, d in phones if d["name"] == "iPhone 17 Pro Max"] or [d for rt, d in phones if d["name"] == "iPhone 16 Pro Max"]
    pick = best or pick
if pick:
    rt = [rt for rt, d in phones if d is pick[-1]][0]
    print(pick[-1]["udid"], pick[-1]["deviceTypeIdentifier"], rt, pick[-1]["name"])
' "$1" | {
  read -r udid type runtime name || exit 0
  if [ "${2:-}" = new ]; then
    xcrun simctl create "$name" "$type" "$runtime"
  else
    echo "$udid"
  fi
}
