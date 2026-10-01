# 03 · Real insider trading feed (SEC Form 4)

## Why
`src/lib/whitewatch-data/edgar-sources.ts` returns a **synthetic-demo** insider posture
(a hard-coded `POSTURE` table). Smart Money (`impl/smart-money-momentum.ts`) and Earnings
(`impl/earnings-move.ts`) build calls on it. Replace it with real SEC EDGAR Form 4 data.
The data is free and needs no key.

## Build
1. **EDGAR client:** ticker → CIK via `https://www.sec.gov/files/company_tickers.json`.
   Recent Form 4 filings via `https://data.sec.gov/submissions/CIK##########.json`.
   Parse each Form 4 XML for **open-market** transactions only: code `P` = purchase,
   `S` = sale. Ignore grants, options exercises and 10b5-1 noise where flagged.
2. **SEC rules:** a descriptive `User-Agent` from env `SEC_USER_AGENT` is required (e.g.
   "Whitewater research contact@example.com"). Stay ≤10 req/s. Cache results (6–12h) with
   Next's fetch caching.
3. **Same shape:** keep `InsiderTransactionsResult` / `InsiderTransactionsSummary`, with
   `provenance: "live"`. Score buy/sell weighted by dollar value and insider role
   (CEO/CFO > director > 10% owner). Window 90 days.
4. **Honest degradation:** if `SEC_USER_AGENT` is missing or SEC is unreachable, return
   `status: "unreachable"`. Do NOT fall back to the synthetic table silently. Delete the
   `POSTURE` table entirely, and make sure the two models and their pages handle
   `unreachable` with a clear label while still giving their momentum-based call.
5. **Tests:** add a small fixture (one real-format Form 4 XML in `scripts/fixtures/`) and a
   `npm run test:edgar` script, mirroring `scripts/test-flex.ts`. If the sandbox can't
   reach sec.gov, say so in the PR. The fixture test must still pass.

## Done when
Build passes. The fixture test passes. The PR documents `SEC_USER_AGENT`.
