#!/bin/sh
# The audio fixture for CI's listen group (DESIGN.md §12.7), made with
# ffmpeg from sine tones, so it is licence-free and its timings are known:
# tone.mp3, 40 s, 24 kbps mono: a soft 220 Hz hum, and a 0.3 s 330 Hz blip
# at each "verse" start (every second from 2.0 s, as fixture.tim says);
# fixture.tim, JHN 3 (36 verses, 1.0 s each from 2.0 s) and JHN 4 (the
# same file: 38 verses, not all reached in its 40 s); and the ESV's
# answers, whose file: address the app takes as this tone.
#   programs/bible/demo/audio/make_fixture.sh
set -eu
cd "$(dirname "$0")"
ffmpeg -nostdin -v error -y -f lavfi \
  -i "aevalsrc='0.06*sin(2*PI*220*t)+gte(t,2)*lt(mod(t-2,1),0.3)*0.4*sin(2*PI*330*t)':s=16000:d=40" \
  -ac 1 -c:a libmp3lame -b:a 24k tone.mp3
line() {
  # BOOK C VERSES: verse 1 at 200 cs, each 100 cs on, the end 30 cs after
  # the last start.
  printf '%s\t%s\t4000\t0\tok\t200' "$1" "$2"
  i=1
  while [ "$i" -lt "$3" ]; do printf ' 100'; i=$((i + 1)); done
  printf ' 30\n'
}
{
  echo "# smooth-bible timings 1 · fixture · BSB · tone.mp3 · made by make_fixture.sh"
  line JHN 3 36
  line JHN 4 38
} > fixture.tim
for c in 3 4; do
  printf '{"v":1,"url":"file:tone.mp3","notice":"(ESV)"}\n' > esv-audio-JHN-$c.json
done
ls -l tone.mp3 fixture.tim
