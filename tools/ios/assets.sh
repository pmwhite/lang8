#!/bin/sh
# Compile an app's asset catalog on a Mac, for building the app elsewhere
# (tools/ios/build-linux.sh):
#   assets.sh DIR [OUT]
# DIR holds AppIcon.png (and AppIcon-dark.png and AppIcon-tinted.png, iOS
# 18's appearances, if it has them) and Colors/ (named colors, as
# colorsets; Accent is the accent color), as tools/ios/build.sh reads them.
# OUT (DIR/assets if not given) gets, for iphoneos and iphonesimulator,
# what actool writes into the app (Assets.car and the icons beside it) and
# its partial Info.plist (icon.plist); iphoneos/build.plist, the SDK's and
# Xcode's versions (the DT keys an App Store build's Info.plist has); and
# inputs.sha256, what they were made from (tools/ios/assets.py hash DIR).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
dir=$(cd "$1" && pwd)
out=${2:-$dir/assets}
mkdir -p "$out"
out=$(cd "$out" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
icons="$work/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$icons"
cp "$dir/AppIcon.png" "$icons/icon.png"
accent=
if [ -d "$dir/Colors" ]; then
  cp -R "$dir/Colors/." "$work/Assets.xcassets/"
  [ -d "$dir/Colors/Accent.colorset" ] && accent="--accent-color Accent"
fi
light='{"images": [{"filename": "icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
 "info": {"author": "xcode", "version": 1}}'
echo "$light" > "$icons/Contents.json"
if [ -f "$dir/AppIcon-dark.png" ] && [ -f "$dir/AppIcon-tinted.png" ]; then
  cp "$dir/AppIcon-dark.png" "$icons/icon-dark.png"
  cp "$dir/AppIcon-tinted.png" "$icons/icon-tinted.png"
  cat > "$icons/Contents.json" <<'JSON'
{"images": [{"filename": "icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"},
  {"appearances": [{"appearance": "luminosity", "value": "dark"}], "filename": "icon-dark.png",
   "idiom": "universal", "platform": "ios", "size": "1024x1024"},
  {"appearances": [{"appearance": "luminosity", "value": "tinted"}], "filename": "icon-tinted.png",
   "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
 "info": {"author": "xcode", "version": 1}}
JSON
fi
# (An app for the iPad too, UIDeviceFamily 2 in DIR's Info.plist: its
# icons as well, CFBundleIcons~ipad's.)
targets="--target-device iphone"
if plutil -extract UIDeviceFamily json -o - "$dir/Info.plist" 2>/dev/null | grep -q 2; then
  targets="$targets --target-device ipad"
fi
for sdk in iphoneos iphonesimulator; do
  rm -rf "$out/$sdk"
  mkdir -p "$out/$sdk"
  compile() {
    xcrun actool --compile "$out/$sdk" --platform "$sdk" --minimum-deployment-target 16.0 \
      $targets --app-icon AppIcon $accent \
      --output-partial-info-plist "$out/$sdk/icon.plist" "$work/Assets.xcassets" > "$work/actool.txt" 2>&1
  }
  if ! compile; then
    cat "$work/actool.txt"
    echo "actool could not compile the icon's appearances; the light icon alone"
    rm -f "$icons/icon-dark.png" "$icons/icon-tinted.png"
    echo "$light" > "$icons/Contents.json"
    compile || { cat "$work/actool.txt"; exit 1; }
  fi
  grep -i "warning\|error" "$work/actool.txt" || true
  xcrun --sdk iphoneos assetutil --info "$out/$sdk/Assets.car" > "$work/assetutil.json" 2>&1 || true
  grep -iE '"Appearance"|AppIcon' "$work/assetutil.json" || echo "assetutil: no AppIcon or Appearance entries"
done
# What an App Store build's Info.plist says it was built with.
sdkv=$(xcrun --sdk iphoneos --show-sdk-version)
sdkb=$(xcrun --sdk iphoneos --show-sdk-build-version)
xv=$(xcodebuild -version | sed -n 's/^Xcode //p')
xb=$(xcodebuild -version | sed -n 's/^Build version //p')
xd=$(echo "$xv" | awk -F. '{ printf "%02d%d%d", $1, $2, $3 }')
python3 -I - "$out/iphoneos/build.plist" "$sdkv" "$sdkb" "$xd" "$xb" "$(sw_vers -buildVersion)" <<'PY'
import plistlib, sys
out, sdkv, sdkb, xd, xb, os_build = sys.argv[1:]
plistlib.dump({
    "DTPlatformName": "iphoneos", "DTPlatformVersion": sdkv, "DTSDKName": "iphoneos" + sdkv,
    "DTSDKBuild": sdkb, "DTPlatformBuild": sdkb, "DTXcode": xd, "DTXcodeBuild": xb,
    "DTCompiler": "com.apple.compilers.llvm.clang.1_0", "BuildMachineOSBuild": os_build,
}, open(out, "wb"))
PY
python3 -I "$here/assets.py" hash "$dir" > "$out/inputs.sha256"
echo "assets: $out"
ls -lR "$out"
