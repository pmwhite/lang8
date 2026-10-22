#!/bin/sh
# Smooth Bible for Android, built on Linux without Gradle, as Better's is
# (tools/android/build.sh): android/main.l8 compiled to arm64
# (`l8 arm64 --target android`) and linked with glue.c into
# libsmoothbible.so; the Java (framework widgets only) compiled and dexed;
# the bundled versions put in the APK's assets; all of it aligned and
# signed with the key in ~/.config/smoothbible-android (made the first
# time).
#
#   programs/bible/android/build.sh OUT.apk [VERSION_CODE]
set -e
out=$(realpath -m "${1:?usage: build.sh OUT.apk [VERSION_CODE]}")
code=${2:-1}
here=$(cd "$(dirname "$0")" && pwd)
top=$(cd "$here/../../.." && pwd)
find_one() { for p in "$@"; do [ -e "$p" ] && { echo "$p"; return; }; done; echo "missing: $1" >&2; exit 1; }
ndk=${ANDROID_NDK:-$(find_one "$HOME"/android-sdk/ndk/* "$HOME"/android-direct/android-ndk-*)}
bt=${ANDROID_BUILD_TOOLS:-$(find_one "$HOME"/android-sdk/build-tools/36* "$HOME"/android-direct/android-16)}
jar=${ANDROID_JAR:-$(find_one "$HOME"/android-sdk/platforms/android-36/android.jar "$HOME"/android-direct/android-36/android.jar)}
javac=${JAVAC:-$(command -v javac || find_one "$HOME"/android-direct/jdk-*/bin/javac)}
keytool=${KEYTOOL:-$(command -v keytool || find_one "$HOME"/android-direct/jdk-*/bin/keytool)}
cc=$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang
keys=$HOME/.config/smoothbible-android
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The app, as arm64 assembly, and the library.
(cd "$top" && ./l8c3 arm64 --target android programs/bible/android/main.l8 -o "$work/bible.s")
mkdir -p "$work/apk/lib/arm64-v8a"
"$cc" -shared -fPIC -O2 -o "$work/apk/lib/arm64-v8a/libsmoothbible.so" \
  "$work/bible.s" "$here/glue.c" -landroid -llog -lm \
  -Wl,-Bsymbolic -Wl,--version-script="$here/exports.map" -Wl,-z,max-page-size=16384 \
  -Wl,--no-undefined

# Its resources, manifest and the versions.
mkdir -p "$work/assets"
for v in bsb kjv web asv ylt; do cp "$top/programs/bible/data/$v.txt" "$work/assets/"; done
"$bt/aapt2" compile --dir "$here/res" -o "$work/res.zip"
mkdir -p "$work/gen"
"$bt/aapt2" link -o "$work/base.apk" -I "$jar" --manifest "$here/AndroidManifest.xml" \
  --java "$work/gen" --min-sdk-version 26 --target-sdk-version 36 \
  --version-code "$code" --version-name "1.0" -A "$work/assets" "$work/res.zip"

# The Java.
mkdir -p "$work/classes"
"$javac" -nowarn -d "$work/classes" --release 17 -cp "$jar" \
  $(find "$here/java" "$work/gen" -name '*.java')
"$bt/d8" --min-api 26 --lib "$jar" --output "$work/apk" $(find "$work/classes" -name '*.class')

# All of it, aligned and signed.
cp "$work/base.apk" "$work/unsigned.apk"
(cd "$work/apk" && zip -q -0 ../unsigned.apk lib/arm64-v8a/libsmoothbible.so && zip -q ../unsigned.apk classes.dex)
"$bt/zipalign" -P 16 -f 4 "$work/unsigned.apk" "$work/aligned.apk"
if [ ! -f "$keys/release.jks" ]; then
  mkdir -p "$keys" && chmod 700 "$keys"
  head -c 24 /dev/urandom | base64 > "$keys/password"
  chmod 600 "$keys/password"
  "$keytool" -genkeypair -keystore "$keys/release.jks" -alias smoothbible -keyalg RSA -keysize 4096 \
    -validity 36500 -storepass:file "$keys/password" -dname "CN=Smooth Bible" >/dev/null 2>&1
  chmod 600 "$keys/release.jks"
fi
"$bt/apksigner" sign --ks "$keys/release.jks" --ks-key-alias smoothbible \
  --ks-pass "file:$keys/password" --out "$out" "$work/aligned.apk"
echo "built $out (version $code)"
