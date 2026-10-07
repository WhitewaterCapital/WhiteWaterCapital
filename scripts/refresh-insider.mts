// ---------------------------------------------------------------------------
// WW-Insider refresh — REAL SEC EDGAR Form 4 open-market insider activity.
//
// Replaces the old hard-coded synthetic POSTURE table. For each ticker:
//   ticker → CIK (sec.gov/files/company_tickers.json)
//   → recent Form 4 filings (data.sec.gov/submissions/CIK##########.json)
//   → each filing's raw XML → non-derivative transactions.
//
// What counts (the academic construction, Lakonishok & Lee 2001; Cohen,
// Malloy & Pomorski 2012):
//   • only OPEN-MARKET trades: code P (purchase) and S (sale). Grants (A),
//     option exercises (M), tax withholding (F), gifts (G) are not signals.
//   • sales flagged as pre-scheduled 10b5-1 plans are excluded — they were
//     decided months earlier and carry no fresh information.
//   • buys are weighted 3× sales: insiders sell for many reasons
//     (diversification, taxes, houses) but buy for one.
//   • role weight: CEO/CFO/President 1.5, other officers 1.2, directors 1.0,
//     10% owners 0.8.
//   score = 100 · (B − S/3) / (B + S/3) · (1 − e^(−n/3)), with B/S the
//   role-weighted $ values and n the number of signal trades (evidence shrink).
//
// Output: public/data/insider/latest.json (read by src/lib/whitewatch-data/
// edgar-sources.ts). Run: npm run refresh:insider
// SEC asks for a descriptive User-Agent; set SEC_USER_AGENT to override.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cikMap, insiderFor, WINDOW_DAYS } from "../src/lib/live/form4";

const UNIVERSE = (process.env.INSIDER_UNIVERSE ??
  "AAPL,MSFT,NVDA,GOOGL,AMZN,META,JPM,XOM,KO,JNJ,PFE,F,BAC,GS,CVX,PEP,GM")
  .split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
const ciks = await cikMap();
const tickers: unknown[] = [];
for (const t of UNIVERSE) {
  const cik = ciks.get(t);
  if (!cik) {
    tickers.push({ ticker: t, error: "no SEC CIK for this ticker" });
    continue;
  }
  process.stdout.write(`→ ${t} … `);
  try {
    const row = await insiderFor(t, cik, since);
    tickers.push(row);
    console.log(`${row.form4_filings_scanned} Form 4s, ${row.summary.buyCount} buys / ${row.summary.sellCount} sells, score ${row.summary.score}`);
  } catch (e) {
    tickers.push({ ticker: t, error: (e as Error).message });
    console.log(`error: ${(e as Error).message}`);
  }
}

const out = {
  schema_version: "1.0.0",
  generated_at: new Date().toISOString(),
  as_of: new Date().toISOString().slice(0, 10),
  window_days: WINDOW_DAYS,
  provenance: "live",
  source: "SEC EDGAR Form 4 (open-market P/S only; 10b5-1 planned sales excluded)",
  method:
    "score = 100·(B − S/3)/(B + S/3) × (1 − e^(−n/3)), n = signal trades; B, S = role-weighted $ value of open-market buys / sells " +
    "(CEO/CFO/President 1.5, officers 1.2, directors 1.0, 10% owners 0.8). Sales count 1/3 as much as buys.",
  tickers,
};
const file = path.join(process.cwd(), "public", "data", "insider", "latest.json");
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`Wrote ${file}`);
