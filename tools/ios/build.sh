#!/bin/sh
# Build Tempo.app from `l8 arm64 --target ios` output, on a Mac (Xcode's
# command-line tools):
#   build.sh sim TEMPO.s OUT        for the iOS simulator
#   build.sh device TEMPO.s OUT     for an iPhone (signed with $IOS_IDENTITY,
#                                   and $IOS_PROFILE embedded, if given)
# The app is OUT/Tempo.app. The code is the same for both; it is linked for
# one platform or the other, against UIKit, Foundation, CoreLocation,
# QuartzCore and OpenGLES.
set -eu
kind=$1
src=$2
out=$3
here=$(cd "$(dirname "$0")" && pwd)
case "$kind" in
  sim) sdk=iphonesimulator; target=arm64-apple-ios16.0-simulator; platform=iPhoneSimulator ;;
  device) sdk=iphoneos; target=arm64-apple-ios16.0; platform=iPhoneOS ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
app="$out/Tempo.app"
rm -rf "$app"
mkdir -p "$app"
sysroot=$(xcrun --sdk "$sdk" --show-sdk-path)
xcrun --sdk "$sdk" clang -target "$target" -c -x assembler "$src" -o "$out/tempo.o"
xcrun --sdk "$sdk" clang -target "$target" -isysroot "$sysroot" "$out/tempo.o" -o "$app/Tempo" \
  -framework UIKit -framework Foundation -framework CoreLocation -framework QuartzCore \
  -framework OpenGLES -lobjc -Wl,-dead_strip
sed "s/PLATFORM/$platform/" "$here/Info.plist" > "$app/Info.plist"
# The icon (AppIcon.png, drawn from AppIcon.svg), compiled into the app and
# named in its Info.plist.
icons="$out/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$icons"
cp "$here/AppIcon.png" "$icons/icon.png"
cat > "$icons/Contents.json" <<'JSON'
{"images": [{"filename": "icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
 "info": {"author": "xcode", "version": 1}}
JSON
xcrun actool --compile "$app" --platform "$sdk" --minimum-deployment-target 16.0 \
  --target-device iphone --app-icon AppIcon --output-partial-info-plist "$out/icon.plist" \
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
plutil -lint "$app/Info.plist"
printf 'APPL????' > "$app/PkgInfo"
cp "$here/PrivacyInfo.xcprivacy" "$app/"
if [ "$kind" = device ] && [ -n "${IOS_PROFILE:-}" ]; then
  cp "$IOS_PROFILE" "$app/embedded.mobileprovision"
fi
codesign --force --sign "${IOS_IDENTITY:--}" --timestamp=none "$app"
echo "built $app"
