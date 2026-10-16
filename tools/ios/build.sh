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
plutil -lint "$app/Info.plist"
printf 'APPL????' > "$app/PkgInfo"
if [ "$kind" = device ] && [ -n "${IOS_PROFILE:-}" ]; then
  cp "$IOS_PROFILE" "$app/embedded.mobileprovision"
fi
codesign --force --sign "${IOS_IDENTITY:--}" --timestamp=none "$app"
echo "built $app"
