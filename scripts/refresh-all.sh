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
PY="$ROOT/intra-exitus-engine/.venv/bin/python"     # has pandas/numpy/scipy/sklearn
INCEPTA_PY="$ROOT/engine/.venv/bin/python"          # has duckdb
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

step "Summary"
echo "ok:     ${ok[*]:-none}"
echo "failed: ${failed[*]:-none}"
[ ${#failed[@]} -eq 0 ]
