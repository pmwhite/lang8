#!/bin/sh
# Build an iOS app from L8 source without a Mac (on Linux, or anywhere the
# compiler runs), as tools/ios/build.sh builds it on one:
#   build-linux.sh sim APP.l8 OUT [DIR]     for the iOS simulator
#   build-linux.sh device APP.l8 OUT [DIR]  for an iPhone; also OUT/NAME.ipa
# DIR is as build.sh reads it (Info.plist, frameworks, resources,
# PrivacyInfo.xcprivacy; tools/ios, Better's, if not given), with its asset
# catalog compiled in DIR/assets (tools/ios/assets.sh makes that on a Mac;
# tools/ios/assets.py checks that it is up to date). The compiler links the
# executable itself (`l8 arm64 --exe`, imports bound as tools/ios/imports.txt
# says); the bundle is then signed ad hoc with rcodesign ($RCODESIGN, or on
# the PATH, or ~/.config/better-ios/bin), or left with the linker's signature
# if there is none. For TestFlight, tools/ios/sign.sh re-signs the IPA.
# $L8 is the compiler (./l8c3 if not given); $BUILD_NUMBER, if given, is the
# bundle's CFBundleVersion; $SDK_VERSION, if given, the SDK the executable
# says it was linked with (DIR/assets' iphoneos SDK if not: UIKit gives an
# app linked with iOS 26's SDK the iOS 26 design).
set -eu
hires() { python3 -c 'import time; print("%.2f" % time.time())'; }
last=$(hires)
lap() { t=$(hires); echo "build-linux.sh: $1 $(python3 -c "print('%.2f' % ($t - $last))") s"; last=$t; }
kind=$1
src=$2
out=$3
here=$(cd "$(dirname "$0")" && pwd)
top=$(cd "$here/../.." && pwd)
dir=$(cd "${4:-$here}" && pwd)
l8=${L8:-$top/l8c3}
case "$kind" in
  sim) sdk=iphonesimulator; target=ios-sim ;;
  device) sdk=iphoneos; target=ios ;;
  *) sed -n '2,15p' "$0"; exit 2 ;;
esac
python3 -I "$here/assets.py" check "$dir"
name=$(python3 -I -c '
import plistlib, sys
print(plistlib.loads(open(sys.argv[1], "rb").read())["CFBundleExecutable"])' "$dir/Info.plist")
mkdir -p "$out"
app="$out/$name.app"
rm -rf "$app"
mkdir -p "$app"
frameworks="UIKit Foundation CoreLocation QuartzCore OpenGLES AVFoundation"
[ -f "$dir/frameworks" ] && frameworks=$(cat "$dir/frameworks")
links=
for f in $frameworks; do links="$links --framework $f"; done
sdkv=${SDK_VERSION:-$(python3 -I "$here/assets.py" get "$dir" iphoneos DTPlatformVersion)}
# ($L8_ARM64_FLAGS: more for the compiler, such as --unchecked-index.)
"$l8" arm64 --target "$target" ${L8_ARM64_FLAGS:-} --exe --sdk "$sdkv" --imports "$here/imports.txt" $links "$src" -o "$app/$name"
lap "compile and link"
python3 -I "$here/macho.py" check "$app/$name"
python3 -I "$here/assets.py" plist "$dir" "$sdk" "$app/Info.plist" "$dir/Info.plist" "${BUILD_NUMBER:-}"
if [ -f "$dir/resources" ]; then
  while read -r f; do
    [ -n "$f" ] || continue
    if [ -d "$top/$f" ]; then cp -R "$top/$f" "$app/"; else cp "$top/$f" "$app/"; fi
  done < "$dir/resources"
fi
for f in "$dir/assets/$sdk"/*; do
  case "$(basename "$f")" in icon.plist|build.plist) ;; *) cp "$f" "$app/" ;; esac
done
printf 'APPL????' > "$app/PkgInfo"
cp "$dir/PrivacyInfo.xcprivacy" "$app/"
if [ "$kind" = device ] && [ -n "${IOS_PROFILE:-}" ]; then
  cp "$IOS_PROFILE" "$app/embedded.mobileprovision"
fi
lap "bundle"
sign=${RCODESIGN:-}
[ -z "$sign" ] && sign=$(command -v rcodesign 2>/dev/null || true)
[ -z "$sign" ] && [ -x "$HOME/.config/better-ios/bin/rcodesign" ] && sign=$HOME/.config/better-ios/bin/rcodesign
if [ -n "$sign" ]; then
  "$sign" sign "$app" > "$out/sign.txt" 2>&1 || { cat "$out/sign.txt"; exit 1; }
  lap "sign (ad hoc, rcodesign)"
else
  echo "build-linux.sh: no rcodesign; the executable keeps the linker's signature, the bundle is not sealed"
fi
if [ "$kind" = device ]; then
  rm -rf "$out/Payload" "$out/$name.ipa"
  mkdir -p "$out/Payload"
  cp -R "$app" "$out/Payload/"
  (cd "$out" && python3 -I -c '
import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk("Payload"):
        dirs.sort()
        for f in sorted(files):
            p = os.path.join(root, f)
            info = zipfile.ZipInfo.from_file(p)
            with open(p, "rb") as data:
                z.writestr(info, data.read(), zipfile.ZIP_DEFLATED)' "$name.ipa")
  rm -rf "$out/Payload"
  lap "ipa"
  echo "built $out/$name.ipa"
fi
echo "built $app"
