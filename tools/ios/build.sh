#!/bin/sh
# Build an app from `l8 arm64 --target ios` output, on a Mac (Xcode's
# command-line tools):
#   build.sh sim APP.s OUT [DIR]     for the iOS simulator
#   build.sh device APP.s OUT [DIR]  for an iPhone (signed with $IOS_IDENTITY,
#                                    and $IOS_PROFILE embedded, if given)
# DIR holds the app's Info.plist (its CFBundleExecutable names the app),
# AppIcon.png and PrivacyInfo.xcprivacy, and if it has them: frameworks (the
# frameworks to link, on a line), resources (files to put in the app, a line
# each, from the repository's top), and Colors/ (named colors, as an asset
# catalog's colorsets; Accent is the app's accent color). It is tools/ios,
# Tempo's, if not given. The app is OUT/NAME.app. The code is the same for
# both; it is linked for one platform or the other.
set -eu
# (Each part's time, in the build's output: build.sh: PART N s.)
hires() { perl -MTime::HiRes=time -e 'printf "%.2f", time'; }
last=$(hires)
lap() { t=$(hires); echo "build.sh: $1 $(perl -e "printf '%.2f', $t - $last") s"; last=$t; }
kind=$1
src=$2
out=$3
here=$(cd "$(dirname "$0")" && pwd)
dir=$(cd "${4:-$here}" && pwd)
top=$(cd "$here/../.." && pwd)
case "$kind" in
  sim) sdk=iphonesimulator; target=arm64-apple-ios16.0-simulator; platform=iPhoneSimulator ;;
  device) sdk=iphoneos; target=arm64-apple-ios16.0; platform=iPhoneOS ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$dir/Info.plist")
app="$out/$name.app"
rm -rf "$app"
mkdir -p "$app"
frameworks="UIKit Foundation CoreLocation QuartzCore OpenGLES"
[ -f "$dir/frameworks" ] && frameworks=$(cat "$dir/frameworks")
links=
for f in $frameworks; do links="$links -framework $f"; done
sysroot=$(xcrun --sdk "$sdk" --show-sdk-path)
lap "sdk lookup"
xcrun --sdk "$sdk" clang -target "$target" -c -x assembler "$src" -o "$out/$name.o"
lap "assemble"
xcrun --sdk "$sdk" clang -target "$target" -isysroot "$sysroot" "$out/$name.o" -o "$app/$name" \
  $links -lobjc -Wl,-dead_strip
lap "link"
sed "s/PLATFORM/$platform/" "$dir/Info.plist" > "$app/Info.plist"
if [ -f "$dir/resources" ]; then
  while read -r f; do [ -n "$f" ] && cp "$top/$f" "$app/"; done < "$dir/resources"
fi
lap "resources"
# The icon (AppIcon.png, drawn from AppIcon.svg), and any named colors,
# compiled into the app and named in its Info.plist.
rm -rf "$out/Assets.xcassets"
icons="$out/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$icons"
cp "$dir/AppIcon.png" "$icons/icon.png"
accent=
if [ -d "$dir/Colors" ]; then
  cp -R "$dir/Colors/." "$out/Assets.xcassets/"
  [ -d "$dir/Colors/Accent.colorset" ] && accent="--accent-color Accent"
fi
cat > "$icons/Contents.json" <<'JSON'
{"images": [{"filename": "icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
 "info": {"author": "xcode", "version": 1}}
JSON
# (DIR's AppIcon-dark.png and AppIcon-tinted.png, if it has them: the icon's
# dark and tinted appearances, iOS 18's; the light icon alone if actool
# cannot compile them.)
light_json=$(cat "$icons/Contents.json")
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
# (An app for the iPad too: its icons as well, as tools/ios/assets.sh does.)
targets="--target-device iphone"
if plutil -extract UIDeviceFamily json -o - "$dir/Info.plist" 2>/dev/null | grep -q 2; then
  targets="$targets --target-device ipad"
fi
actool() {
  rm -rf "$out/actool-out"
  mkdir -p "$out/actool-out"
  xcrun actool --compile "$out/actool-out" --platform "$sdk" --minimum-deployment-target 16.0 \
    $targets --app-icon AppIcon $accent --output-partial-info-plist "$out/icon.plist" \
    "$out/Assets.xcassets" > "$out/actool.txt" 2>&1
}
# (actool takes a minute and more on a fresh Mac. With $ACTOOL_CACHE, what
# it made is kept there, by its inputs and Xcode's version, and used again.)
cached=
if [ -n "${ACTOOL_CACHE:-}" ]; then
  key=$( { echo "$sdk $accent $targets"; xcodebuild -version; (cd "$out/Assets.xcassets" && find . -type f | sort | xargs shasum); } | shasum | cut -c1-20)
  cached="$ACTOOL_CACHE/$key"
fi
if [ -n "$cached" ] && [ -f "$cached/icon.plist" ]; then
  echo "actool: kept output $key"
  rm -rf "$out/actool-out"
  cp -R "$cached/out" "$out/actool-out"
  cp "$cached/icon.plist" "$cached/actool.txt" "$out/"
else
  if ! actool; then
    cat "$out/actool.txt"
    echo "actool could not compile the icon's appearances; the light icon alone"
    rm -f "$icons/icon-dark.png" "$icons/icon-tinted.png"
    echo "$light_json" > "$icons/Contents.json"
    actool || { cat "$out/actool.txt"; exit 1; }
  fi
  if [ -n "$cached" ]; then
    rm -rf "$cached" && mkdir -p "$cached"
    cp -R "$out/actool-out" "$cached/out"
    cp "$out/icon.plist" "$out/actool.txt" "$cached/"
  fi
fi
cp -R "$out/actool-out/." "$app/"
lap "actool"
grep -i "warning\|error" "$out/actool.txt" || true
# What actool put in the catalog: the icon's entries, and the appearances
# (UIAppearanceDark, the tinted one) if they were compiled in.
if [ -f "$app/Assets.car" ]; then
  echo "assetutil: the icon's appearances in $app/Assets.car"
  xcrun --sdk iphoneos assetutil --info "$app/Assets.car" > "$out/assetutil.json" 2>&1 || true
  grep -iE '"Appearance"|AppIcon' "$out/assetutil.json" || echo "assetutil: no AppIcon or Appearance entries"
fi
lap "assetutil"
/usr/libexec/PlistBuddy -c "Merge $out/icon.plist" "$app/Info.plist"
# What it was built with (Xcode adds this, and App Store Connect checks it).
if [ "$kind" = device ]; then
  sdkv=$(xcrun --sdk "$sdk" --show-sdk-version)
  sdkb=$(xcrun --sdk "$sdk" --show-sdk-build-version)
  xv=$(xcodebuild -version | sed -n 's/^Xcode //p')
  xb=$(xcodebuild -version | sed -n 's/^Build version //p')
  xd=$(echo "$xv" | awk -F. '{ printf "%02d%d%d", $1, $2, $3 }')
  for kv in "DTPlatformName string iphoneos" "DTPlatformVersion string $sdkv" \
    "DTSDKName string iphoneos$sdkv" "DTSDKBuild string $sdkb" "DTPlatformBuild string $sdkb" \
    "DTXcode string $xd" "DTXcodeBuild string $xb" \
    "DTCompiler string com.apple.compilers.llvm.clang.1_0" \
    "BuildMachineOSBuild string $(sw_vers -buildVersion)"; do
    set -- $kv
    /usr/libexec/PlistBuddy -c "Add :$1 $2 $3" "$app/Info.plist"
  done
fi
# A build number given (CI's run number for the simulator's build), written
# into the bundle's own Info.plist before it is signed: the app reads it there.
if [ -n "${BUILD_NUMBER:-}" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$app/Info.plist"
fi
plutil -lint "$app/Info.plist"
printf 'APPL????' > "$app/PkgInfo"
cp "$dir/PrivacyInfo.xcprivacy" "$app/"
if [ "$kind" = device ] && [ -n "${IOS_PROFILE:-}" ]; then
  cp "$IOS_PROFILE" "$app/embedded.mobileprovision"
fi
lap "plists"
codesign --force --sign "${IOS_IDENTITY:--}" --timestamp=none "$app"
lap "codesign"
echo "built $app"
