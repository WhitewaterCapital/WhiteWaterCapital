#!/usr/bin/env bash
# Aurora daily refresh (runs on James's Mac via launchd — Aurora can't run in
# GitHub Actions: it lives only in the local aurora-macro-engine repo and needs
# Octave + its FRED key).
#
# 8:30 a.m. New York on weekdays, ahead of the 9:00 cloud refresh. Works in a
# DEDICATED clone (~/.whitewater-refresh) so it never touches the working
# folder or uncommitted work; runs Aurora from a throwaway copy so the Aurora
# repo is never modified; validates; commits ONLY public/data/aurora/latest.json.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# macOS blocks background (launchd) jobs from reading ~/Desktop, so this job
# reads a MIRROR of the Aurora repo kept outside it. The mirror is re-synced
# from the Desktop copy every time `npm run refresh:all` runs in a terminal.
# (Aurora's data comes live from FRED either way; only code changes need it.)
AURORA_DIR="${AURORA_DIR:-$HOME/.whitewater-refresh/aurora-mirror}"
CLONE="$HOME/.whitewater-refresh/WhiteWaterCapital"
REMOTE="https://github.com/WhitewaterCapital/WhiteWaterCapital.git"
log() { echo "[$(date '+%F %T')] $*"; }

# launchd fires at several local times; only proceed at 8 a.m. New York, weekdays.
ny_hour=$(TZ=America/New_York date +%H); ny_dow=$(TZ=America/New_York date +%u)
if [ "${FORCE:-0}" != "1" ] && { [ "$ny_hour" != "08" ] || [ "$ny_dow" -gt 5 ]; }; then
  exit 0
fi

# Only once per NY day.
stamp="$HOME/.whitewater-refresh/last-aurora"
today=$(TZ=America/New_York date +%F)
[ "${FORCE:-0}" != "1" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$today" ] && exit 0

log "Aurora refresh start"
mkdir -p "$(dirname "$CLONE")"
[ -d "$CLONE/.git" ] || git clone -q "$REMOTE" "$CLONE" || { log "clone failed"; exit 1; }
cd "$CLONE" && git fetch -q origin main && git checkout -q main && git reset -q --hard origin/main || { log "git sync failed"; exit 1; }

tmp="$(mktemp -d)"
rsync -a --exclude .git --exclude logs "$AURORA_DIR/" "$tmp/aurora/"
if (cd "$tmp/aurora" && python3 -m aurora.export.export --horizon 20 && python3 -m tests.validate_export); then
  cp "$tmp/aurora/exports/latest.json" "$CLONE/public/data/aurora/latest.json"
else
  log "Aurora export/validation failed — leaving the last good file"; rm -rf "$tmp"; exit 1
fi
rm -rf "$tmp"

git add public/data/aurora/latest.json
if git diff --cached --quiet; then
  log "No change."
else
  git -c user.name="whitewater-data-bot" -c user.email="minnehanjames-hub@users.noreply.github.com" \
    commit -q -m "data: Aurora macro refresh $today"
  for i in 1 2 3; do git push -q origin main && break; git pull -q --rebase origin main; done
  log "Pushed."
fi
echo "$today" > "$stamp"
log "Aurora refresh done"
