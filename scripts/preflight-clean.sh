#!/usr/bin/env bash
# KIN-133 — gate in front of `eas build` / `eas update`. Both ship whatever is
# on disk, not what's committed, so an uncommitted local edit silently rides
# along into a real build/OTA update with no record of what changed. Fails
# closed: any unstaged or staged-but-uncommitted change blocks the run.
set -uo pipefail

if git diff --quiet && git diff --cached --quiet; then
  exit 0
fi

echo "preflight: uncommitted changes present — commit or stash before running eas build/update." >&2
git diff --name-only >&2
git diff --cached --name-only >&2
exit 1
