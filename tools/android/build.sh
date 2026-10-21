#!/bin/sh
# Build Better for Android, on Linux, without Gradle:
#   tools/android/build.sh OUT.apk [VERSION_CODE]
# It compiles programs/better/android.l8 to arm64 (`l8 arm64 --target
# android`), links it with glue.c into libbetter.so, compiles the Java
# beside it, and signs the APK with the key in ~/.config/better-android
# (made the first time: keep it, as each update must be signed with it).
#
# Tools: the NDK, build-tools, android.jar and javac from ANDROID_NDK,
# ANDROID_BUILD_TOOLS, ANDROID_JAR and JAVAC, or found under ~/android-sdk
# or ~/android-direct (a JDK there too).
set -eu
out=$(realpath -m "$1")
code=${2:-1}
here=$(cd "$(dirname "$0")" && pwd)
top=$(cd "$here/../.." && pwd)
find_one() { for p in "$@"; do [ -e "$p" ] && { echo "$p"; return; }; done; echo "missing: $1" >&2; exit 1; }
ndk=${ANDROID_NDK:-$(find_one "$HOME"/android-sdk/ndk/* "$HOME"/android-direct/android-ndk-*)}
bt=${ANDROID_BUILD_TOOLS:-$(find_one "$HOME"/android-sdk/build-tools/36* "$HOME"/android-direct/android-16)}
jar=${ANDROID_JAR:-$(find_one "$HOME"/android-sdk/platforms/android-36/android.jar "$HOME"/android-direct/android-36/android.jar)}
javac=${JAVAC:-$(command -v javac || find_one "$HOME"/android-direct/jdk-*/bin/javac)}
cc=$ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang
keys=$HOME/.config/better-android
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The program, as arm64 assembly, and the library.
(cd "$top" && ./l8c3 arm64 --target android programs/better/android.l8 -o "$work/better.s")
mkdir -p "$work/apk/lib/arm64-v8a"
"$cc" -shared -fPIC -O2 -o "$work/apk/lib/arm64-v8a/libbetter.so" \
  "$work/better.s" "$here/glue.c" -lEGL -lGLESv3 -landroid -llog -lm \
  -Wl,-Bsymbolic -Wl,--version-script="$here/exports.map" -Wl,-z,max-page-size=16384 \
  -Wl,--no-undefined

# Its resources and manifest.
"$bt/aapt2" compile --dir "$here/res" -o "$work/res.zip"
mkdir -p "$work/gen"
"$bt/aapt2" link -o "$work/base.apk" -I "$jar" --manifest "$here/AndroidManifest.xml" \
  --java "$work/gen" --min-sdk-version 26 --target-sdk-version 36 \
  --version-code "$code" --version-name "1.0" "$work/res.zip"

# The Java.
mkdir -p "$work/classes"
"$javac" -nowarn -d "$work/classes" --release 17 -cp "$jar" \
  $(find "$here/java" "$work/gen" -name '*.java')
"$bt/d8" --min-api 26 --lib "$jar" --output "$work/apk" $(find "$work/classes" -name '*.class')

# All of it, aligned and signed.
cp "$work/base.apk" "$work/unsigned.apk"
(cd "$work/apk" && zip -q -0 ../unsigned.apk lib/arm64-v8a/libbetter.so && zip -q ../unsigned.apk classes.dex)
"$bt/zipalign" -P 16 -f 4 "$work/unsigned.apk" "$work/aligned.apk"
if [ ! -f "$keys/release.jks" ]; then
  mkdir -p "$keys" && chmod 700 "$keys"
  head -c 24 /dev/urandom | base64 > "$keys/password"
  chmod 600 "$keys/password"
  keytool -genkeypair -keystore "$keys/release.jks" -alias better -keyalg RSA -keysize 4096 \
    -validity 36500 -storepass:file "$keys/password" -dname "CN=Better" >/dev/null 2>&1
  chmod 600 "$keys/release.jks"
fi
"$bt/apksigner" sign --ks "$keys/release.jks" --ks-key-alias better \
  --ks-pass "file:$keys/password" --out "$out" "$work/aligned.apk"
echo "built $out (version $code)"
