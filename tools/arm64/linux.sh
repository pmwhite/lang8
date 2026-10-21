#!/bin/sh
# Assemble and link arm64 Linux assembly from `l8 arm64 --target linux` with
# LLVM's tools (`l8 arm64 --exe` links it without them; `l8 test --arm64`
# does), or run an arm64 executable under qemu-aarch64:
#   linux.sh build FILE.s OUT    (OUT may be a /proc/self/fd/N path)
#   linux.sh run EXE ARGS...
# Tools come from L8_ARM64_CC (clang with the AArch64 target), L8_ARM64_LD
# (ld.lld) and L8_ARM64_QEMU (qemu-aarch64), with defaults for a clang on the
# PATH and the Debian packages unpacked under /tmp/a64tools.
set -e
cc=${L8_ARM64_CC:-clang}
ld=${L8_ARM64_LD:-/tmp/a64tools/usr/lib/llvm-14/bin/ld.lld}
qemu=${L8_ARM64_QEMU:-/tmp/a64tools/usr/bin/qemu-aarch64-static}
case "$1" in
  build)
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    "$cc" --target=aarch64-linux-gnu -c -x assembler "$2" -o "$tmp/a.o"
    # (Libraries a program declares, as OpenGL, are not there: calls to
    # them would fail, but a test that does not make them can run.)
    "$ld" -static --warn-unresolved-symbols "$tmp/a.o" -o "$tmp/a.out" 2>/dev/null
    cat "$tmp/a.out" > "$3"
    chmod +x "$3" 2>/dev/null || true ;;
  run)
    shift
    exec "$qemu" "$@" ;;
  *) sed -n '2,8p' "$0"; exit 2 ;;
esac
