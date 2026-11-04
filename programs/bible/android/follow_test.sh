#!/bin/sh
# Android's following (java/.../Follow.java) checked against core's rules:
# compiled with a JDK (javac on the PATH, or the one in ~/android-direct
# the Android build uses) and run on the cases tools/link_cases.l8 writes.
#
#   programs/bible/android/follow_test.sh .build/link-cases.txt
set -e
cases=${1:?usage: follow_test.sh LINK_CASES.txt}
here=$(cd "$(dirname "$0")" && pwd)
jdk_tool() {
  if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/$1" ]; then echo "$JAVA_HOME/bin/$1"; return; fi
  if command -v "$1" >/dev/null 2>&1 && command -v javac >/dev/null 2>&1; then command -v "$1"; return; fi
  for p in "$HOME"/android-direct/jdk-*/bin/"$1"; do [ -x "$p" ] && { echo "$p"; return; }; done
}
javac=$(jdk_tool javac)
java=$(jdk_tool java)
if [ -z "$javac" ] || [ -z "$java" ]; then
  echo "follow_test.sh: no JDK found (javac): set JAVA_HOME, put javac on the PATH, or unpack one in ~/android-direct" >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
"$javac" -nowarn -d "$work" --release 17 \
  "$here/java/space/trailingwhite/smoothbible/Follow.java" "$here/tests/FollowCheck.java"
"$java" -cp "$work" space.trailingwhite.smoothbible.FollowCheck "$cases"
