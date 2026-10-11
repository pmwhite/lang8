#!/bin/sh
# Look after the skate leaderboards (see worker.js). People and groups are
# made on the admin's page (web/skate/admin.html); this prints the way in,
# and what devices have reported of how the game went on them.
# The admin secret is read from ~/.config/skate-board/admin-secret.
#   ./admin.sh link     the admin page's link (it is the key to everything: keep it)
#   ./admin.sh all      every person and group, as the page sees them
#   ./admin.sh reports [query]   the latest reports, a line each, newest first;
#                       query as kind=error, kind=perf, person=NAME, session=ID, limit=200
#   ./admin.sh report ID   one report in full (or SESSION, for all of a visit)
set -eu
site=${SKATE_API:-https://trailingwhite.space/skate}
secret=${SKATE_ADMIN:-$(cat "$HOME/.config/skate-board/admin-secret")}
get() { curl -sS "$site/api/admin/$1" -H "authorization: Bearer $secret"; }
case "${1:-}" in
  link) echo "$site/admin#$secret" ;;
  all) get all; echo ;;
  reports)
    get "reports?$(echo "${2:-}" | tr ' ' '&')" | jq -r '.reports[] | [
      (.id | tostring), (.at / 1000 | strflocaltime("%m-%d %H:%M")), .session, (.name // "-"), .kind,
      (if .kind == "perf" then "\(.data.fps) fps of \(.data.refresh), \(.data.slow)/\(.data.frames) slow, \(.data.hitches) hitches, worst \(.data.worst) ms, scale \(.data.scale), \(.data.gpu // "?")"
       else "\(.data.what): \(.data.message)" end),
      (.data.host // "")
    ] | join("  ")' ;;
  report)
    case "$2" in
      *[!0-9]*) get "reports?session=$2&limit=500" | jq '.reports | reverse | .[]' ;;
      *) get "reports?limit=500" | jq --argjson id "$2" '.reports[] | select(.id == $id)' ;;
    esac ;;
  *) sed -n '2,10p' "$0" ;;
esac
