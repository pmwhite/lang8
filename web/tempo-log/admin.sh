#!/bin/sh
# Look after Tempo's logs (see worker.js). The admin secret is read from
# ~/.config/tempo-log/admin-secret.
#   ./admin.sh new NAME     make a log, and print its owner's link (keep it: it is the key)
#   ./admin.sh all          every log
#   ./admin.sh relink ID    a new link for a log (the old one stops working)
#   ./admin.sh past LINK    the texts a log had before, newest first
#   ./admin.sh show LINK REV   one of them
#   ./admin.sh restore LINK REV   make it the log again
# TEMPO_API and TEMPO_ADMIN point it at another worker (a local one:
# http://localhost:8799/tempo/api and the secret it was started with);
# TEMPO_PAGE is Tempo's page the links are to.
set -eu
api=${TEMPO_API:-https://trailingwhite.space/tempo/api}
page=${TEMPO_PAGE:-https://menegroth.tail5f0149.ts.net/tempo/}
admin() { echo "${TEMPO_ADMIN:-$(cat "$HOME/.config/tempo-log/admin-secret")}"; }
# (The secret, from a link or as it is.)
secret_of() { echo "$1" | sed 's/.*#me=//'; }
case "${1:-}" in
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
  *) sed -n '2,13p' "$0" ;;
esac
