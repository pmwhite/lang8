#!/bin/sh
# Look after the people every game shares (see worker.js). People and
# groups are made on the admin's page (web/people/admin.html); this prints
# the way in, and everyone as the page sees them.
# The admin secret is read from ~/.config/people/admin-secret.
#   ./admin.sh link     the admin page's link (it is the key to everything: keep it)
#   ./admin.sh all      every person and group
set -eu
site=${PEOPLE_SITE:-https://trailingwhite.space}
secret=${PEOPLE_ADMIN:-$(cat "$HOME/.config/people/admin-secret")}
case "${1:-}" in
  link) echo "$site/people/admin.html#$secret" ;;
  all) curl -sS "$site/people/api/admin/all" -H "authorization: Bearer $secret"; echo ;;
  *) sed -n '2,8p' "$0" ;;
esac
