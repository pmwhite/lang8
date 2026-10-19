#!/bin/sh
# Look after Better's logs (see worker.js). The admin secret is read from
# ~/.config/better-log/admin-secret.
#   ./admin.sh invite NAME  make a log for someone, and print the text to send them
#                           (a code to sign in with, good 14 days)
#   ./admin.sh admin ID     mark a log's owner as an admin (People in the app)
#   ./admin.sh unadmin ID   not an admin any more
#   ./admin.sh new NAME     make a log, and print its owner's link (keep it: it is the key)
#   ./admin.sh all          every log
#   ./admin.sh relink ID    a new link for a log (the old one, and every device
#                           signed in, stop working)
#   ./admin.sh past LINK    the texts a log had before, newest first
#   ./admin.sh show LINK REV   one of them
#   ./admin.sh restore LINK REV   make it the log again
# BETTER_API and BETTER_ADMIN point it at another worker (a local one:
# http://localhost:8799/better/api and the secret it was started with);
# BETTER_PAGE is Better's page the links are to; BETTER_FROM who an invite
# is from (Philip).
set -eu
api=${BETTER_API:-https://trailingwhite.space/better/api}
page=${BETTER_PAGE:-https://trailingwhite.space/better/}
admin() { echo "${BETTER_ADMIN:-$(cat "$HOME/.config/better-log/admin-secret")}"; }
# (The secret, from a link or as it is.)
secret_of() { echo "$1" | sed 's/.*#me=//'; }
flag() {
  curl -sS -X POST "$api/admin/flag" -H "authorization: Bearer $(admin)" -d "{\"id\": \"$1\", \"admin\": $2}"
  echo
}
case "${1:-}" in
  invite)
    out=$(curl -sS -X POST "$api/admin/invite" -H "authorization: Bearer $(admin)" \
      -d "$(jq -n --arg name "$2" '{name: $name, friend: false}')")
    code=$(echo "$out" | jq -r '.code // empty')
    if [ -z "$code" ]; then
      echo "$out"
      exit 1
    fi
    shown=$(echo "$code" | tr a-z A-Z | sed 's/^\(....\)/\1-/')
    until=$(date -d "@$(($(echo "$out" | jq -r .until) / 1000))" '+%b %-d')
    printf '%s added you to Better, for keeping your runs, rides and walks.\n\n' "${BETTER_FROM:-Philip}"
    printf 'Open %s#c=%s\nor in the Better app, go to You, Sign in, and enter %s.\n\n' "$page" "$code" "$shown"
    printf 'Good until %s.\n' "$until" ;;
  admin) flag "$2" true ;;
  unadmin) flag "$2" false ;;
  new)
    out=$(curl -sS -X POST "$api/admin/log" -H "authorization: Bearer $(admin)" -d "{\"name\": \"$2\"}")
    echo "$out" | jq -r --arg page "$page" 'if .secret then "\($page)#me=\(.secret)" else . end' ;;
  all) curl -sS "$api/admin/all" -H "authorization: Bearer $(admin)" | jq . ;;
  relink)
    curl -sS -X POST "$api/admin/relink" -H "authorization: Bearer $(admin)" -d "{\"id\": \"$2\"}" |
      jq -r --arg page "$page" 'if .secret then "\($page)#me=\(.secret)" else . end' ;;
  past) curl -sS "$api/past" -H "authorization: Bearer $(secret_of "$2")" | jq -r '.[] | "\(.rev)  \(.at / 1000 | strflocaltime("%Y-%m-%d %H:%M"))  \(.size) bytes"' ;;
  show) curl -sS "$api/past?rev=$3" -H "authorization: Bearer $(secret_of "$2")" | jq -r .text ;;
  restore) curl -sS -X POST "$api/restore" -H "authorization: Bearer $(secret_of "$2")" -d "{\"rev\": $3}"; echo ;;
  *) sed -n '2,19p' "$0" ;;
esac
