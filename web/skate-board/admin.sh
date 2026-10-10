#!/bin/sh
# Look after the skate leaderboards (see worker.js). The admin secret is
# read from ~/.config/skate-board/admin-secret.
#   ./admin.sh board "Friends"            make a board; prints its code and link
#   ./admin.sh rotate <code>              give a board a new code
#   ./admin.sh delete <code>              delete a board
#   ./admin.sh delete <code> NAME         delete a player and their runs
#   ./admin.sh delete <code> NAME 7       delete a player's run on course 7
#   ./admin.sh show <code>                the board
set -eu
api=https://trailingwhite.space/skate/api
secret=$(cat "$HOME/.config/skate-board/admin-secret")
call() { curl -sS -X POST "$api/admin/$1" -H "authorization: Bearer $secret" -H "content-type: application/json" -d "$2"; echo; }
case "${1:-}" in
  board) call board "{\"title\": \"${2:-Friends}\"}" ;;
  rotate) call rotate "{\"code\": \"$2\"}" ;;
  delete)
    if [ $# -ge 4 ]; then call delete "{\"code\": \"$2\", \"name\": \"$3\", \"course\": $4}"
    elif [ $# -ge 3 ]; then call delete "{\"code\": \"$2\", \"name\": \"$3\"}"
    else call delete "{\"code\": \"$2\"}"; fi ;;
  show) curl -sS "$api/board/$2"; echo ;;
  *) sed -n '2,10p' "$0" ;;
esac
