#!/bin/sh
# Look after the skate leaderboards (see worker.js). People and groups are
# made on the admin's page (web/people/admin.html: see ../people-api/admin.sh
# for its link); this prints what devices have reported of how the game
# went on them.
# The admin secret is read from ~/.config/skate-board/admin-secret.
#   ./admin.sh last     when each person last rode
#   ./admin.sh reports [query]   the latest reports, a line each, newest first;
#                       query as kind=error, kind=perf, person=NAME, session=ID, limit=200
#   ./admin.sh report ID   one report in full (or SESSION, for all of a visit)
#   ./admin.sh line FILE STYLE   post a replay (as .build/skate-route writes
#                       one) as its place's best line of STYLE (wild or human),
#                       kept if it beats the one there
#   ./admin.sh lines [PLACE...]   search each place (by default slopestyles
#                       1-5, today's, and big air) for its best wild and human
#                       lines, and post them; each search takes ROUTE_SECONDS
#                       (default 10)
set -eu
site=${SKATE_API:-https://trailingwhite.space/skate}
secret=${SKATE_ADMIN:-$(cat "$HOME/.config/skate-board/admin-secret")}
get() { curl -sS "$site/api/admin/$1" -H "authorization: Bearer $secret"; }
root=$(cd "$(dirname "$0")/../.." && pwd)
route=${SKATE_ROUTE:-$root/.build/skate-route}
# post_line FILE STYLE: a replay file is "version place score name steps...".
post_line() {
  read -r version course score name replay < "$1"
  jq -n --argjson course "$course" --arg style "$2" --argjson score "$score" --argjson version "$version" --arg replay "$replay" \
    '{course: $course, style: $style, score: $score, version: $version, replay: $replay}' |
    curl -sS "$site/api/admin/line" -H "authorization: Bearer $secret" -H "content-type: application/json" --data-binary @-
  echo
}
case "${1:-}" in
  last) get last; echo ;;
  reports)
    get "reports?$(echo "${2:-}" | tr ' ' '&')" | jq -r '.reports[] | [
      (.id | tostring), (.at / 1000 | strflocaltime("%m-%d %H:%M")), .session, (.name // "-"), .kind,
      (if .data.why == "probe" then "probe (ms a frame, of which the game itself): \(.data.probe | tojson), scale \(.data.scale), \(.data.gpu // "?")"
       elif .kind == "perf" then "\(.data.fps) fps of \(.data.refresh), cpu \(.data.cpu // "?") ms, \(.data.slow)/\(.data.frames) slow, \(.data.hitches) hitches, worst \(.data.worst) ms, scale \(.data.scale)\(if .data.plain then " plain" else "" end), \(.data.gpu // "?")"
       else "\(.data.what): \(.data.message)" end),
      (.data.host // "")
    ] | join("  ")' ;;
  report)
    case "$2" in
      *[!0-9]*) get "reports?session=$2&limit=500" | jq '.reports | reverse | .[]' ;;
      *) get "reports?limit=500" | jq --argjson id "$2" '.reports[] | select(.id == $id)' ;;
    esac ;;
  line) post_line "$2" "$3" ;;
  lines)
    [ -x "$route" ] || { echo "no $route: make skate-route first" >&2; exit 1; }
    shift
    places=${*:-"1 2 3 4 5 $(TZ=America/New_York date +%Y%m%d) 200000001"}
    out=$(mktemp -d)
    for place in $places; do
      for style in wild human; do
        flag=""
        [ "$style" = human ] && flag=--human
        echo "place $place, $style:"
        if "$route" "$place" $flag --seconds "${ROUTE_SECONDS:-10}" --out "$out/line" 2>/dev/null | grep '^in all'; then post_line "$out/line" "$style"; fi
      done
    done
    rm -r "$out" ;;
  *) sed -n '2,17p' "$0" ;;
esac
