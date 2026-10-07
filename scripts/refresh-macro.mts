// ---------------------------------------------------------------------------
// Macro Tracker refresh — REAL cross-sector read (replaces the RNG demo).
//
// Inputs (all free, real):
//   • the 8 SPDR sector ETFs + SPY + the 10-year yield (^TNX), daily, Yahoo
//   • the Fed's published 2026 FOMC calendar (federalreserve.gov, verified
//     2026-10-07) and the earnings engine's real calendar
//     (public/data/earnings/latest.json)
//
// Per sector, a signed sentiment in −100..+100 from three standard trend reads:
//   rel 3m  = 3-month return minus SPY's       → ±10% relative saturates (weight 0.45)
//   rel 1m  = 1-month return minus SPY's       → ±5% relative saturates  (weight 0.25)
//   trend   = price vs its 50- and 200-day MAs → +1 above both, −1 below (weight 0.30)
// Overall = breadth-weighted average; regime from SPY's own trend, breadth
// and the 10y yield's 1-month change. Stated scales, not a backtested model.
//
// Output: public/data/macro-tracker/latest.json. Run: npm run refresh:macro
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SECTORS: [string, string][] = [
  ["Technology", "XLK"],
  ["Financials", "XLF"],
  ["Energy", "XLE"],
  ["Healthcare", "XLV"],
  ["Industrials", "XLI"],
  ["Consumer Disc.", "XLY"],
  ["Staples", "XLP"],
  ["Materials", "XLB"],
];

// Federal Reserve, "Meeting calendars and information", 2026 (decision = day 2).
const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];

async function closes(sym: string): Promise<number[]> {
  const now = Math.floor(Date.now() / 1000);
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${now - 420 * 86400}&period2=${now + 86400}&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0 (Whitewater research)" } },
  );
  if (!res.ok) throw new Error(`${sym}: HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const c: (number | null)[] = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  const today = new Date().toISOString().slice(0, 10);
  // Drop today's unsettled bar.
  return ts
    .map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), c[i]] as const)
    .filter(([d, v]) => v != null && d < today)
    .map(([, v]) => v as number);
}

const ret = (x: number[], n: number) => (x.length > n ? x[x.length - 1] / x[x.length - 1 - n] - 1 : NaN);
const sma = (x: number[], n: number) => (x.length >= n ? x.slice(-n).reduce((a, b) => a + b, 0) / n : NaN);
const sat = (v: number, full: number) => Math.max(-1, Math.min(1, v / full));
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

const spy = await closes("SPY");
const tnx = await closes("^TNX");
const spy1m = ret(spy, 21);
const spy3m = ret(spy, 63);

const sectors = [];
for (const [name, sym] of SECTORS) {
  const px = await closes(sym);
  const r1 = ret(px, 21) - spy1m;
  const r3 = ret(px, 63) - spy3m;
  const last = px[px.length - 1];
  const above50 = last > sma(px, 50);
  const above200 = last > sma(px, 200);
  const trend = (above50 ? 0.5 : -0.5) + (above200 ? 0.5 : -0.5);
  const s = Math.round(100 * (0.45 * sat(r3, 0.1) + 0.25 * sat(r1, 0.05) + 0.3 * trend));
  const lead = r3 > 0.02 ? "leading the market" : r3 < -0.02 ? "lagging the market" : "in line with the market";
  const tr = above50 && above200 ? "above both its 50- and 200-day averages" : !above50 && !above200 ? "below both its 50- and 200-day averages" : above200 ? "above its 200-day but below its 50-day average" : "above its 50-day but below its 200-day average";
  // Absolute read (own 3-month return + trend), for the market-level gauge.
  const abs = Math.round(100 * (0.6 * sat(ret(px, 63), 0.1) + 0.4 * trend));
  sectors.push({
    sector: name,
    etf: sym,
    sentiment: s,
    abs,
    rel1m: r1,
    rel3m: r3,
    note: `${sym} ${lead} over 3 months (${pct(r3)} vs SPY; 1-month ${pct(r1)}), ${tr}.`,
  });
}

// Sector `sentiment` is RELATIVE to SPY (rotation). SPY is cap-weighted and
// tech-heavy, so when tech leads most sectors read negative by construction —
// the market-level gauge therefore uses each sector's ABSOLUTE trend instead.
const overall = Math.round(sectors.reduce((a, x) => a + x.abs, 0) / sectors.length);
const breadth = sectors.filter((x) => x.abs > 0).length;
const spyLast = spy[spy.length - 1];
const spyUp = spyLast > sma(spy, 200) && spyLast > sma(spy, 50);
const tnxChg = tnx.length > 21 ? tnx[tnx.length - 1] - tnx[tnx.length - 22] : NaN; // in yield points (^TNX = yield)
const ratesWord = Number.isFinite(tnxChg) ? (tnxChg > 0.15 ? "rising" : tnxChg < -0.15 ? "falling" : "steady") : "unknown";
const defensive = (sectors.find((x) => x.etf === "XLP")!.sentiment + sectors.find((x) => x.etf === "XLV")!.sentiment) / 2;
const cyclical = (sectors.find((x) => x.etf === "XLY")!.sentiment + sectors.find((x) => x.etf === "XLI")!.sentiment + sectors.find((x) => x.etf === "XLF")!.sentiment) / 3;

const regime =
  `${spyUp ? "Uptrend" : "Downtrend/chop"} · ${breadth}/8 sectors positive · ` +
  `${
    cyclical > defensive + 15
      ? cyclical > 0 ? "cyclicals leading (risk-on)" : "cyclicals falling less than defensives"
      : defensive > cyclical + 15
        ? defensive > 0 ? "defensives leading (risk-off)" : "defensives holding up better than cyclicals (late-cycle tell)"
        : "no clear cyclical/defensive tilt"
  } · ` +
  `10y yield ${ratesWord}${Number.isFinite(tnxChg) ? ` (${tnxChg >= 0 ? "+" : ""}${(tnxChg * 100).toFixed(0)}bp in a month)` : ""}`;

const sorted = [...sectors].sort((a, b) => b.sentiment - a.sentiment);
const summary =
  `Market-level read is ${overall > 15 ? "constructive" : overall < -15 ? "defensive" : "mixed"} (${overall >= 0 ? "+" : ""}${overall}, ${breadth}/8 sectors in absolute uptrends). ` +
  `Relative leaders: ${sorted.slice(0, 2).map((x) => x.sector).join(" and ")}; laggards: ${sorted.slice(-2).map((x) => x.sector).join(" and ")}. ` +
  `SPY is ${pct(spy3m)} over 3 months and ${spyUp ? "above" : "not above"} both trend lines; ` +
  `${breadth >= 6 ? "broad participation backs the move" : breadth <= 2 ? "leadership is dangerously narrow" : "participation is selective"}.`;

// Catalysts: next real FOMC decisions + the earnings engine's real calendar.
const today = new Date().toISOString().slice(0, 10);
const catalysts: { date: string; event: string; importance: "high" | "medium" | "low" }[] = FOMC_2026.filter(
  (d) => d >= today,
)
  .slice(0, 2)
  .map((d) => ({ date: d, event: "FOMC rate decision", importance: "high" as const }));
const earnFile = path.join(process.cwd(), "public", "data", "earnings", "latest.json");
if (existsSync(earnFile)) {
  const e = JSON.parse(readFileSync(earnFile, "utf8"));
  if (e.data_provenance === "live") {
    for (const ev of e.events ?? []) {
      catalysts.push({ date: ev.report_date, event: `${ev.ticker} earnings`, importance: "medium" });
    }
  }
}
catalysts.sort((a, b) => a.date.localeCompare(b.date));

const out = {
  schema_version: "1.0.0",
  generated_at: new Date().toISOString(),
  as_of: today,
  provenance: "live",
  source: "Yahoo daily prices (SPDR sector ETFs, SPY, ^TNX); Federal Reserve FOMC calendar; earnings engine",
  regime,
  sentiment: overall,
  breadth,
  sectors: sectors.map(({ sector, etf, sentiment, abs, note }) => ({ sector, etf, sentiment, absolute: abs, note })),
  catalysts: catalysts.slice(0, 8),
  summary,
};
const file = path.join(process.cwd(), "public", "data", "macro-tracker", "latest.json");
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(regime);
console.log(summary);
for (const s of sorted) console.log(`  ${s.sector.padEnd(15)} ${String(s.sentiment).padStart(4)}  ${s.note}`);
console.log(`Wrote ${file}`);
