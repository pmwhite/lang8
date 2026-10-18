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
xcrun --sdk "$sdk" clang -target "$target" -c -x assembler "$src" -o "$out/$name.o"
xcrun --sdk "$sdk" clang -target "$target" -isysroot "$sysroot" "$out/$name.o" -o "$app/$name" \
  $links -lobjc -Wl,-dead_strip
sed "s/PLATFORM/$platform/" "$dir/Info.plist" > "$app/Info.plist"
if [ -f "$dir/resources" ]; then
  while read -r f; do [ -n "$f" ] && cp "$top/$f" "$app/"; done < "$dir/resources"
fi
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
xcrun actool --compile "$app" --platform "$sdk" --minimum-deployment-target 16.0 \
  --target-device iphone --app-icon AppIcon $accent --output-partial-info-plist "$out/icon.plist" \
  "$out/Assets.xcassets" >/dev/null
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
codesign --force --sign "${IOS_IDENTITY:--}" --timestamp=none "$app"
echo "built $app"
