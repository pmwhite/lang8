#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
hook=$(git -C "$repo" rev-parse --git-path hooks/pre-commit)
if [[ "$hook" != /* ]]; then hook="$repo/$hook"; fi
mkdir -p "$(dirname "$hook")"
if [[ -e "$hook" || -L "$hook" ]] && [[ "$(readlink "$hook" 2>/dev/null || true)" != "$repo/.githooks/pre-commit" ]]; then
    echo "Existing pre-commit hook at $hook; install .githooks/pre-commit manually." >&2
    exit 1
fi
ln -sfn "$repo/.githooks/pre-commit" "$hook"
echo "Installed $hook"
