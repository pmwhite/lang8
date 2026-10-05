`l8 browse` writes one HTML page with a file list, the code, symbol spans,
hover types, and navigation. Count what a small program produces:

  $ l8 browse $TESTDIR/../compiler/hello.l8 -o hello.html
  $ for pattern in 'id="files"' 'class="file' 'data-s=' 'data-t=' 'Go to definition' 'Find references' 'putchar'; do
  >     printf '%s: ' "$pattern"; grep -c -F "$pattern" hello.html | sed 's/^[1-9][0-9]*$/present/'
  > done
  id="files": present
  class="file: present
  data-s=: present
  data-t=: present
  Go to definition: present
  Find references: present
  putchar: present

The compiler's own page includes each of its files:

  $ cd $TESTDIR/../.. && l8 browse src2/main.l8 -o $OLDPWD/l8.html && cd - > /dev/null
  $ for file in compiler parse check codegen browse testrun cram; do
  >     printf 'src2/%s.l8: ' $file; grep -c -F "src2/$file.l8" l8.html | sed 's/^[1-9][0-9]*$/present/'
  > done
  src2/compiler.l8: present
  src2/parse.l8: present
  src2/check.l8: present
  src2/codegen.l8: present
  src2/browse.l8: present
  src2/testrun.l8: present
  src2/cram.l8: present
