#!/usr/bin/env bash
# Refresh every engine export the site reads, on REAL data, then copy them into
# public/data/. Free sources only (Yahoo prices, SEC EDGAR, Ken French, Nasdaq
# earnings calendar, Fed FOMC calendar). Tiingo is used instead of Yahoo where
# TIINGO_API_KEY is set. Commit public/data/ and push to publish.
#
#   npm run refresh:all
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
# Local: the engines' own venvs. CI: set PY=python INCEPTA_PY=python.
PY="${PY:-$ROOT/intra-exitus-engine/.venv/bin/python}"      # pandas/numpy/scipy/sklearn
INCEPTA_PY="${INCEPTA_PY:-$ROOT/engine/.venv/bin/python}"   # + duckdb
AURORA_DIR="${AURORA_DIR:-$ROOT/../aurora-macro-engine}"
export SEC_USER_AGENT="${SEC_USER_AGENT:-Whitewater Research https://whitewater-management.vercel.app}"
export PRICES_PROVIDER="${PRICES_PROVIDER:-yahoo}"
INCEPTA_UNIVERSE="${INCEPTA_UNIVERSE:-AAPL MSFT NVDA GOOGL AMZN META JPM XOM KO JNJ PFE F}"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok=(); failed=()
run() { local name="$1"; shift; step "$name"; if "$@"; then ok+=("$name"); else failed+=("$name"); fi; }

run "Incepta (SEC fundamentals + prices)" bash -c "cd engine && $INCEPTA_PY -m incepta.cli ingest $INCEPTA_UNIVERSE >/dev/null && $INCEPTA_PY -m incepta.cli export $INCEPTA_UNIVERSE"
run "Intra/Exitus (entry/exit levels)"      bash -c "cd intra-exitus-engine && $PY -m ie.export"
run "Factor (Fama-French exposures)"        bash -c "cd factor-engine && $PY -m fac.export"
run "Weekly (cross-sectional ranking)"      bash -c "cd weekly-engine && $PY -m wf.export"
run "Kalman (pairs)"                        bash -c "cd kalman-engine && $PY -m kf.export"
run "Earnings (calendar)"                   bash -c "cd earnings-engine && EARNINGS_CALENDAR_PROVIDER=nasdaq $PY -m ee.export"
run "Insider (SEC Form 4)"                  npx -y tsx scripts/refresh-insider.mts
run "Macro tracker (sectors, rates, FOMC)"  npx -y tsx scripts/refresh-macro.mts

# Aurora (Sentimentum · Macro) lives in its own local repo, owned by a separate
# workstream, and needs Octave + its FRED key — so it only runs where that repo
# exists (James's Mac), never in CI. It runs from a throwaway COPY so the Aurora
# repo itself is never modified; only the validated latest.json is copied here.
aurora_refresh() {
  local tmp; tmp="$(mktemp -d)"
  rsync -a --exclude .git --exclude logs "$AURORA_DIR/" "$tmp/aurora/"
  (cd "$tmp/aurora" && python3 -m aurora.export.export --horizon 20 && python3 -m tests.validate_export) \
    && cp "$tmp/aurora/exports/latest.json" "$ROOT/public/data/aurora/latest.json"
  local rc=$?; rm -rf "$tmp"; return $rc
}
if [ -d "$AURORA_DIR/aurora" ] && command -v octave >/dev/null; then
  run "Aurora (macro DSGE + FRED regime)" aurora_refresh
else
  step "Aurora (macro DSGE + FRED regime)"; echo "skipped — Aurora repo/Octave not available here (runs on James's Mac only)"
fi

step "Summary"
echo "ok:     ${ok[*]:-none}"
echo "failed: ${failed[*]:-none}"
[ ${#failed[@]} -eq 0 ]
