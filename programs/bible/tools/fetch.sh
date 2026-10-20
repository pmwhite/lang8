#!/bin/sh
# The sources of Smooth Bible's text and language data, downloaded into DIR
# (a new, empty directory) and checked against the sha256 they were made
# from; then the app's data made from them:
#   fetch.sh DIR          download and check
#   fetch.sh DIR make     and make data/ again: the BSB and the other
#                         versions (usfm.py, versify.py), the language data
#                         (bsb_lang.py), each word's sense (senses.py),
#                         related words (related.py), cross references
#                         (xrefs.py) and Matthew Henry's Concise
#                         Commentary (mhcc.py)
# bereanbible.com turns away curl's own User-Agent, so a browser's is sent.
# The files are data, not code: the tools read them with python3 -I.
set -eu
dir=$1
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$dir"
ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
stepdata=https://raw.githubusercontent.com/STEPBible/STEPBible-Data/ed476a8ee6e3f7b3a46fc48af6c7dabc02387b1d
step=$stepdata/Lexicons
amal="$stepdata/Translators%20Amalgamated%20OT%2BNT"
get() {
  [ -f "$dir/$1" ] || curl -sSfL -A "$ua" -o "$dir/$1" "$2"
}
# The Berean Standard Bible's USFM (2026-03-08) and its translation tables
# (public domain), and STEP Bible's brief lexicons (CC BY 4.0).
get bsb_usfm.zip https://bereanbible.com/bsb_usfm.zip
get bsb_tables.tsv https://bereanbible.com/bsb_tables.tsv
get TBESH.txt "$step/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt"
get TBESG.txt "$step/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt"
# The public-domain versions, from eBible.org (USFM), each zip in a
# directory of its own; OpenBible.info's cross references (CC BY 4.0); and
# CCEL's Concise Commentary (public domain). eBible republishes its zips: when
# a sum fails, make again, read the diff of the text made, and change the sum
# in the same commit (DESIGN.md §9.2.1).
for id in eng-kjv2006 engwebp eng-asv engylt; do
  mkdir -p "$dir/ebible/$id"
  get "ebible/$id/${id}_usfm.zip" "https://ebible.org/Scriptures/${id}_usfm.zip"
done
get cross-references.zip https://a.openbible.info/data/cross-references.zip
get mhcc.xml https://ccel.org/ccel/henry/mhcc.xml
# STEP's amalgamated Hebrew and Greek texts (TAHOT, TAGNT; CC BY 4.0), for
# each word's extended Strong's; and Clear's MACULA Proximity (CC BY 4.0),
# words used in similar contexts.
for p in Gen-Deu Jos-Est Job-Sng Isa-Mal; do
  get "TAHOT-$p.txt" "$amal/TAHOT%20$p%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
done
for p in Mat-Jhn Act-Rev; do
  get "TAGNT-$p.txt" "$amal/TAGNT%20$p%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt"
done
get Proximity.tsv https://raw.githubusercontent.com/Clear-Bible/macula-greek/8423afe47b9e8f24b7772e808af45c7159a6fe7e/sources/Clear/synonyms/Proximity.tsv
(cd "$dir" && sha256sum -c) <<'SUMS'
f0c56438eb89c98e8f62c5c00461e25cc35b098ad5b179bc350cede759ee5f87  bsb_usfm.zip
09bbee6f9fe4fa22b5df28e8a9ffa99bf9c33435f4eb8c47c2dc221d855d35cb  bsb_tables.tsv
464dccadd95fd8620dd05fa0d7a4caba58ec3c4d5db3ebf38e43d046ca25b591  TBESH.txt
312f723d7b8ef263bbdfb0451c9b8057125804dfff390b6f8544cff2a84b57f4  TBESG.txt
16b08c9248b3600662f66f1e055f61fc3a6c7275e347236ee45feb35dfb20cb3  ebible/eng-kjv2006/eng-kjv2006_usfm.zip
732c17d3325563fc5d8d98157a6c3d128c887f6b8e5a5ad0f71f58e5d5eebfcb  ebible/engwebp/engwebp_usfm.zip
fa116257643253288c48a46f499faaaa501dfdd8381c78e1c67b745a9e1a999a  ebible/eng-asv/eng-asv_usfm.zip
63ef17706cc59cdbf7921627a40dc819e59ae2903d6f85ab23efc49d6da723f2  ebible/engylt/engylt_usfm.zip
3b694f0db9ea81e125c78e88b1845ec18e8b99e63ac94eee3be58ab92cca27f1  cross-references.zip
4a5509ba5064b54572397ae1a796561ff6ce4a1e18f366af0141a09c5d06fcd6  mhcc.xml
e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b  TAHOT-Gen-Deu.txt
195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775  TAHOT-Jos-Est.txt
bb508af3af07822fca84cc43a0eba79eb70eecf672aabc0245b8d8cecf329d96  TAHOT-Job-Sng.txt
f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5  TAHOT-Isa-Mal.txt
ab8eaaeb68e17a1dcfa34e1e9350358f22f03bc2a97244d848750ad81044bc8e  TAGNT-Mat-Jhn.txt
524e32375361e6d3fa2f7ef00b87605fdc4317a762f395651a05fdc31ad031b7  TAGNT-Act-Rev.txt
dd4faa737a91d98b77620f636520d763df60e51c44ed2a1207cc2e98643f586c  Proximity.tsv
SUMS
[ "${2:-}" = make ] || exit 0
rm -rf "$dir/usfm"
mkdir "$dir/usfm"
(cd "$dir/usfm" && unzip -q ../bsb_usfm.zip)
usfm=$(dirname "$(find "$dir/usfm" -name GEN.usfm)")
data=$here/../data
python3 -I "$here/usfm.py" bsb "$usfm" "$data/bsb.txt"
for v in kjv:eng-kjv2006 web:engwebp asv:eng-asv ylt:engylt; do
  id=${v#*:}
  rm -rf "$dir/ebible/$id/usfm"
  mkdir "$dir/ebible/$id/usfm"
  (cd "$dir/ebible/$id/usfm" && unzip -q "../${id}_usfm.zip")
  python3 -I "$here/usfm.py" "${v%%:*}" "$dir/ebible/$id/usfm" "$data/${v%%:*}.txt"
done
python3 -I "$here/versify.py" "$data"
python3 -I "$here/xrefs.py" "$dir/cross-references.zip" "$data"
python3 -I "$here/mhcc.py" "$dir/mhcc.xml" "$data/bsb.txt" "$data/mhcc.txt"
python3 -I "$here/bsb_lang.py" "$dir/bsb_tables.tsv" "$dir/TBESH.txt" "$dir/TBESG.txt" \
  "$data/bsb.txt" "$data/lang"
python3 -I "$here/senses.py" "$dir" "$data"
python3 -I "$here/related.py" "$dir/Proximity.tsv" "$data"
python3 -I "$here/learn.py" "$data"
