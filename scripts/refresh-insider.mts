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

const UA = process.env.SEC_USER_AGENT?.trim() || "Whitewater Research https://whitewater-management.vercel.app";
const WINDOW_DAYS = 90;
const MAX_FILINGS = 80; // per ticker, most recent first
const UNIVERSE = (process.env.INSIDER_UNIVERSE ??
  "AAPL,MSFT,NVDA,GOOGL,AMZN,META,JPM,XOM,KO,JNJ,PFE,F,BAC,GS,CVX,PEP,GM")
  .split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function sec(url: string): Promise<Response> {
  const gap = Date.now() - last;
  if (gap < 130) await sleep(130 - gap); // ≤ ~8 req/s, under SEC's 10/s
  last = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, text/xml" } });
    if (res.status !== 429 && res.status < 500) return res;
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`SEC request kept failing: ${url}`);
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${name}>`).exec(xml);
  return m ? decode(m[1].trim()) : null;
};
const blocks = (xml: string, name: string): string[] =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);

type Txn = {
  date: string;
  insider: string;
  role: string;
  code: "P" | "S";
  shares: number;
  price: number;
  value: number;
  plan10b51: boolean;
};

function roleOf(xml: string): { role: string; weight: number } {
  const rel = blocks(xml, "reportingOwnerRelationship")[0] ?? "";
  const title = (tag(rel, "officerTitle") ?? "").toLowerCase();
  const on = (n: string) => /^(1|true)$/i.test(tag(rel, n) ?? "");
  if (on("isOfficer")) {
    if (/chief executive|ceo|chief financial|cfo|president/.test(title)) return { role: tag(rel, "officerTitle") ?? "Officer", weight: 1.5 };
    return { role: tag(rel, "officerTitle") || "Officer", weight: 1.2 };
  }
  if (on("isDirector")) return { role: "Director", weight: 1.0 };
  if (on("isTenPercentOwner")) return { role: "10% owner", weight: 0.8 };
  return { role: "Other", weight: 0.8 };
}

function parseForm4(xml: string, issuerCik: number): (Txn & { weight: number })[] {
  // A company's submissions list also contains Form 4s it filed AS AN OWNER of
  // other issuers (e.g. Goldman reporting trades in a fund it holds 10% of).
  // Those are not insider trades in this stock — keep only our issuer.
  if (Number(tag(xml, "issuerCik") ?? -1) !== issuerCik) return [];
  const owner = tag(xml, "rptOwnerName") ?? "Unknown";
  const { role, weight } = roleOf(xml);
  // Newer forms flag 10b5-1 at document level; older ones only in footnotes.
  const plan =
    /^(1|true)$/i.test(tag(xml, "aff10b5One") ?? "") || /10b5-1/i.test(blocks(xml, "footnotes")[0] ?? "");
  const out: (Txn & { weight: number })[] = [];
  for (const t of blocks(xml, "nonDerivativeTransaction")) {
    const code = tag(t, "transactionCode");
    if (code !== "P" && code !== "S") continue;
    const shares = Number(tag(t, "transactionShares"));
    const price = Number(tag(t, "transactionPricePerShare"));
    if (!(shares > 0) || !(price > 0)) continue;
    out.push({
      date: tag(t, "transactionDate") ?? "",
      insider: owner,
      role,
      code,
      shares,
      price,
      value: shares * price,
      plan10b51: code === "S" && plan,
      weight,
    });
  }
  return out;
}

async function cikMap(): Promise<Map<string, number>> {
  const j = (await (await sec("https://www.sec.gov/files/company_tickers.json")).json()) as Record<
    string,
    { cik_str: number; ticker: string }
  >;
  return new Map(Object.values(j).map((r) => [r.ticker.toUpperCase(), r.cik_str]));
}

async function forTicker(ticker: string, cik: number, since: string) {
  const subs = await (await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)).json();
  const r = subs.filings.recent as { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] };
  const idx = r.form
    .map((f, i) => i)
    .filter((i) => r.form[i] === "4" && r.filingDate[i] >= since)
    .slice(0, MAX_FILINGS);
  const txns: (Txn & { weight: number })[] = [];
  for (const i of idx) {
    const acc = r.accessionNumber[i].replace(/-/g, "");
    const doc = r.primaryDocument[i].split("/").pop(); // drop the xsl render dir
    try {
      const res = await sec(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}`);
      if (res.ok) txns.push(...parseForm4(await res.text(), cik));
    } catch {
      /* one bad filing never sinks the ticker */
    }
  }
  const signal = txns.filter((t) => t.date >= since && !t.plan10b51);
  const B = signal.filter((t) => t.code === "P").reduce((a, t) => a + t.value * t.weight, 0);
  const S = signal.filter((t) => t.code === "S").reduce((a, t) => a + t.value * t.weight, 0);
  const denom = B + S / 3;
  // Direction from the dollar balance; strength shrunk by how much evidence
  // there is, so one small trade can't read as a maximal signal:
  // n=1 → ×0.28, n=3 → ×0.63, n=6 → ×0.86.
  const raw = denom > 0 ? (100 * (B - S / 3)) / denom : 0;
  const score = Math.round(raw * (1 - Math.exp(-signal.length / 3)));
  const buys = signal.filter((t) => t.code === "P");
  const sells = signal.filter((t) => t.code === "S");
  return {
    ticker,
    cik,
    form4_filings_scanned: idx.length,
    summary: {
      signalTransactionCount: signal.length,
      score,
      netDirection: Math.sign(score),
      buyCount: buys.length,
      sellCount: sells.length,
      distinctInsiders: new Set(signal.map((t) => t.insider)).size,
      buyValueUsd: Math.round(buys.reduce((a, t) => a + t.value, 0)),
      sellValueUsd: Math.round(sells.reduce((a, t) => a + t.value, 0)),
      plannedSalesExcluded: txns.filter((t) => t.date >= since && t.plan10b51).length,
    },
    transactions: signal
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 25)
      .map(({ weight: _w, ...t }) => ({ ...t, value: Math.round(t.value) })),
  };
}

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
    const row = await forTicker(t, cik, since);
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
