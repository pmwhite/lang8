#!/bin/sh
# Look after the skate leaderboards (see worker.js). People and groups are
# made on the admin's page (web/skate/admin.html); this prints the way in.
# The admin secret is read from ~/.config/skate-board/admin-secret.
#   ./admin.sh link     the admin page's link (it is the key to everything: keep it)
#   ./admin.sh all      every person and group, as the page sees them
set -eu
site=https://trailingwhite.space/skate
secret=$(cat "$HOME/.config/skate-board/admin-secret")
case "${1:-}" in
  link) echo "$site/admin.html#$secret" ;;
  all) curl -sS "$site/api/admin/all" -H "authorization: Bearer $secret"; echo ;;
  *) sed -n '2,6p' "$0" ;;
esac
