#!/bin/sh
# The sources of Smooth Bible's text and language data, downloaded into DIR
# (a new, empty directory) and checked against the sha256 they were made
# from; then the app's data made from them:
#   fetch.sh DIR          download and check
#   fetch.sh DIR make     and make data/bsb.txt and data/lang/ again
# bereanbible.com turns away curl's own User-Agent, so a browser's is sent.
# The files are data, not code: the tools read them with python3 -I.
set -eu
dir=$1
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$dir"
ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
step=https://raw.githubusercontent.com/STEPBible/STEPBible-Data/ed476a8ee6e3f7b3a46fc48af6c7dabc02387b1d/Lexicons
get() {
  [ -f "$dir/$1" ] || curl -sSfL -A "$ua" -o "$dir/$1" "$2"
}
# The Berean Standard Bible's USFM (2026-03-08) and its translation tables
# (public domain), and STEP Bible's brief lexicons (CC BY 4.0).
get bsb_usfm.zip https://bereanbible.com/bsb_usfm.zip
get bsb_tables.tsv https://bereanbible.com/bsb_tables.tsv
get TBESH.txt "$step/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt"
get TBESG.txt "$step/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt"
(cd "$dir" && sha256sum -c) <<'SUMS'
f0c56438eb89c98e8f62c5c00461e25cc35b098ad5b179bc350cede759ee5f87  bsb_usfm.zip
09bbee6f9fe4fa22b5df28e8a9ffa99bf9c33435f4eb8c47c2dc221d855d35cb  bsb_tables.tsv
464dccadd95fd8620dd05fa0d7a4caba58ec3c4d5db3ebf38e43d046ca25b591  TBESH.txt
312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4  TBESG.txt
SUMS
[ "${2:-}" = make ] || exit 0
rm -rf "$dir/usfm"
mkdir "$dir/usfm"
(cd "$dir/usfm" && unzip -q ../bsb_usfm.zip)
usfm=$(dirname "$(find "$dir/usfm" -name GEN.usfm)")
data=$here/../data
python3 -I "$here/bsb.py" "$usfm" "$data/bsb.txt"
python3 -I "$here/bsb_lang.py" "$dir/bsb_tables.tsv" "$dir/TBESH.txt" "$dir/TBESG.txt" \
  "$data/bsb.txt" "$data/lang"
