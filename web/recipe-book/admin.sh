#!/bin/sh
# Look after the recipe book's kitchens (see worker.js). The admin secret
# is read from ~/.config/recipe-book/admin-secret.
#   ./admin.sh new NAME     make a kitchen, and print its owner's link (keep it: it is the key)
#   ./admin.sh all          every kitchen
#   ./admin.sh relink ID    a new link for a kitchen (the old one stops working)
#   ./admin.sh past LINK    the texts a kitchen had before, newest first
#   ./admin.sh show LINK REV   one of them
#   ./admin.sh restore LINK REV   make it the kitchen again
# RECIPES_API and RECIPES_ADMIN point it at another worker (a local one:
# http://localhost:8798/recipes/api and the secret it was started with);
# RECIPES_PAGE is the book's page the links are to.
set -eu
api=${RECIPES_API:-https://trailingwhite.space/recipes/api}
page=${RECIPES_PAGE:-https://trailingwhite.space/recipes/}
admin() { echo "${RECIPES_ADMIN:-$(cat "$HOME/.config/recipe-book/admin-secret")}"; }
# (The secret, from a link or as it is.)
secret_of() { echo "$1" | sed 's/.*#me=//'; }
case "${1:-}" in
  new)
    out=$(curl -sS -X POST "$api/admin/kitchen" -H "authorization: Bearer $(admin)" -d "{\"name\": \"$2\"}")
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
