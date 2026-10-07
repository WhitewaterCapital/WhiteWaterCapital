import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { analyzeTicker, type LiveAnalysis } from "./analyze";
import { dailyBars } from "./yahoo";
import { earningsOutlook, type EarningsOutlook } from "./nasdaq";
import { relativeValue, type RelValue } from "./relvalue";
import { insiderFor, WINDOW_DAYS } from "./form4";
import { combineInsiderMomentum } from "@/lib/models/momentum";
import { equityVerdict, type Verdict, type Driver } from "@/lib/models/equity-read";
import { distresse } from "@/lib/models/impl/distresse";
import { intraExitus } from "@/lib/models/impl/intra-exitus";
import type { StressVerdict, EntryExitPlan, TradeEvidence } from "@/lib/models/types";

// ═══════════════════════════════════════════════════════════════════════════
// The Desk, for ONE ticker: run every model on live data and turn each into a
// card with a call, a conviction, a one-line why, and a full breakdown — then
// combine them into one desk view, naming where the models disagree.
//
// Consensus weights (directional models only):
//   Fundamentals 0.32 · Momentum & insiders 0.20 · Analysts & earnings 0.20 ·
//   Macro fit 0.16 · Relative value 0.12
// The Stress Test reuses the fundamentals inputs, so it is shown (as the
// adversarial check) but does NOT vote twice. Entry/exit plans the desk's side.
// ═══════════════════════════════════════════════════════════════════════════

export type Call = "Long" | "Lean long" | "Neutral" | "Lean short" | "Short";
export type Row = { label: string; value: string; note?: string; score?: number | null };
export type Section = { title: string; summary?: string; rows: Row[] };

export type ModelCard = {
  id: string;
  name: string;
  question: string; // what this model answers, in plain words
  available: boolean;
  call: Call | null;
  direction: number; // −1..+1 (signed lean)
  conviction: number; // 0..100
  headline: string;
  weight: number; // consensus weight (0 = shown, not voting)
  breakdown: { sections: Section[]; method: string; sources: string[] };
};

export type DeskView = {
  call: Call;
  conviction: number;
  score: number; // −1..+1
  summary: string;
  agree: string[];
  disagree: string[];
};

export type DeskResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  quote: LiveAnalysis["quote"];
  spark: { date: string; close: number }[];
  stats: Row[];
  view: DeskView;
  cards: ModelCard[];
  plan: EntryExitPlan | null;
  stress: StressVerdict | null;
  earnings: EarningsOutlook | null;
  flags: string[];
  asOf: string;
};

const pct = (x: number | null | undefined, d = 1, signed = false) =>
  x == null || !Number.isFinite(x) ? "—" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const fx = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(d));
const big = (x: number | null | undefined) =>
  x == null ? "—" : x >= 1e12 ? `$${(x / 1e12).toFixed(2)}T` : x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(0)}M` : `$${x.toFixed(0)}`;
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

export function callOf(d: number): Call {
  return d >= 0.3 ? "Long" : d >= 0.08 ? "Lean long" : d <= -0.3 ? "Short" : d <= -0.08 ? "Lean short" : "Neutral";
}

// ── sector → SPDR ETF ────────────────────────────────────────────────────────
const SECTOR_ETF: Record<string, string> = {
  Technology: "XLK",
  Finance: "XLF",
  Energy: "XLE",
  "Health Care": "XLV",
  Industrials: "XLI",
  "Consumer Discretionary": "XLY",
  "Consumer Staples": "XLP",
  "Basic Materials": "XLB",
  Utilities: "XLU",
  "Real Estate": "XLRE",
  Telecommunications: "XLC",
};
function etfFor(sector: string | null, sic: string | null): string {
  if (sector && SECTOR_ETF[sector]) return SECTOR_ETF[sector];
  const c = Number(sic);
  if (c >= 2830 && c <= 2836) return "XLV";
  if ((c >= 3570 && c <= 3579) || (c >= 3670 && c <= 3679) || (c >= 7370 && c <= 7379)) return "XLK";
  if (c >= 6000 && c <= 6799) return "XLF";
  if (c === 1311 || c === 2911 || c === 1381) return "XLE";
  if (c >= 2000 && c <= 2099) return "XLP";
  if (c >= 4900 && c <= 4999) return "XLU";
  return "SPY";
}

async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", rel), "utf8")) as T;
  } catch {
    return null;
  }
}

// ── 1. Fundamentals ──────────────────────────────────────────────────────────
const STANCE_DIR: Record<Verdict["stance"], number> = { attractive: 1, constructive: 0.5, neutral: 0, cautious: -0.5, avoid: -1 };
const fmtDriver = (d: Driver) => {
  if (d.value == null) return "—";
  switch (d.fmt) {
    case "pct": return pct(d.value);
    case "pctSigned": return pct(d.value, 1, true);
    case "ratio": return fx(d.value);
    case "int": return String(Math.round(d.value));
    case "bps": return `${d.value.toFixed(0)} bp`;
  }
};
function fundamentalsCard(v: Verdict, a: LiveAnalysis): ModelCard {
  const sec = (title: string, r: Verdict["health"] | Verdict["valuation"] | Verdict["trend"] | Verdict["risk"]): Section => ({
    title: `${title}${r.score != null ? ` — ${Math.round(r.score)}/100${r.band ? ` (${r.band})` : ""}` : ""}`,
    summary: r.headline,
    rows: r.drivers.map((d) => ({ label: d.label, value: fmtDriver(d), note: d.verdict, score: d.score == null ? null : Math.round(d.score) })),
  });
  const available = v.health.score != null || v.valuation.score != null || v.trend.score != null;
  const dir = STANCE_DIR[v.stance] * (v.conviction / 100);
  return {
    id: "fundamentals",
    name: "Fundamentals",
    question: "Is this a good business at a fair price, with the tape on our side?",
    available,
    call: available ? callOf(dir) : null,
    direction: dir,
    conviction: v.conviction,
    headline: v.call,
    weight: 0.32,
    breakdown: {
      sections: [sec("Financial health", v.health), sec("Valuation", v.valuation), sec("Trend", v.trend), sec("Risk / volatility", v.risk)],
      method:
        "Health (40%), valuation (32%) and trend (28%) are each scored 0–100 from documented breakpoints on real filings and prices, " +
        "then combined. Conviction grows with how far the blend leans and how much the three agree; thin data and high volatility cut it. " +
        "A distressed balance sheet caps any long at 'cautious' (value-trap rule).",
      sources: [`SEC XBRL filings (FY ${a.security.quality?.period_end ?? "—"})`, `Yahoo daily prices (to ${a.security.as_of})`],
    },
  };
}

// ── 2. Stress test (adversarial; doesn't vote) ──────────────────────────────
function stressCard(s: StressVerdict, side: "long" | "short"): ModelCard {
  const go = s.rating === "go";
  return {
    id: "stress",
    name: "Stress test",
    question: `What's the strongest case AGAINST going ${side}?`,
    available: !s.noEvidence,
    call: s.noEvidence ? null : go ? (side === "long" ? "Lean long" : "Lean short") : "Neutral",
    direction: 0,
    conviction: s.conviction,
    headline: s.bottomLine,
    weight: 0,
    breakdown: {
      sections: [
        { title: "Devil's advocate", rows: s.devilsAdvocate.map((t) => ({ label: "•", value: "", note: t })) },
        { title: "Tail risks", rows: s.tailRisks.map((t) => ({ label: "•", value: "", note: t })) },
        { title: "Scorecard (for this side)", rows: s.dimensions.map((d) => ({ label: d.label, value: `${d.score > 0 ? "+" : ""}${d.score}`, note: d.note })) },
      ],
      method: `Distresse re-reads the same fundamentals from the ${side} side and argues against it. It doesn't vote in the desk view (same inputs as Fundamentals) — it's the check that the call survives its best counter-argument.`,
      sources: ["Same evidence as Fundamentals"],
    },
  };
}

// ── 3. Momentum & insiders ───────────────────────────────────────────────────
type Insider = Awaited<ReturnType<typeof insiderFor>> | null;
function momentumCard(a: LiveAnalysis, ins: Insider): ModelCard {
  const mom = a.security.risk?.mom_12_1 ?? null;
  const tilt = mom == null ? null : clamp(mom * 2) * 100;
  const s = ins?.summary;
  const insScore = s && s.signalTransactionCount > 0 ? s.score : null;
  const score = tilt == null && insScore == null ? null : combineInsiderMomentum(insScore, tilt);
  const dir = score == null ? 0 : score / 100;
  const conv = score == null ? 0 : Math.round(Math.min(95, Math.abs(score) * (insScore != null && tilt != null && Math.sign(insScore) === Math.sign(tilt) ? 1.1 : 0.9)));
  const momWord = mom == null ? "no price history" : `${pct(mom, 0, true)} over 12 months (skipping the last month)`;
  const insWord =
    insScore == null
      ? `no discretionary insider trades in ${WINDOW_DAYS} days`
      : `insiders ${insScore > 0 ? "net buying" : "net selling"} (${s!.buyCount} buys, ${s!.sellCount} sells, ${s!.distinctInsiders} people)`;
  return {
    id: "momentum",
    name: "Momentum & insiders",
    question: "Is the price trend with us, and are the people who know the company buying?",
    available: score != null,
    call: score == null ? null : callOf(dir),
    direction: dir,
    conviction: conv,
    headline: `Price ${momWord}; ${insWord}.`,
    weight: 0.2,
    breakdown: {
      sections: [
        {
          title: "Price momentum",
          rows: [
            { label: "12-1 month return", value: pct(mom, 1, true), note: "Winners tend to keep winning for months (Jegadeesh & Titman 1993)." },
            { label: "Last month", value: pct(a.security.risk?.ret_1m, 1, true), note: "Skipped in the signal: one-month moves tend to reverse." },
            { label: "Signal (±50% saturates)", value: tilt == null ? "—" : `${tilt > 0 ? "+" : ""}${tilt.toFixed(0)}` },
          ],
        },
        {
          title: `Insider flow — SEC Form 4, last ${WINDOW_DAYS} days`,
          summary: insScore == null ? "No open-market insider trades — no signal either way." : undefined,
          rows: [
            { label: "Open-market buys", value: String(s?.buyCount ?? 0), note: s?.buyValueUsd ? big(s.buyValueUsd) : undefined },
            { label: "Open-market sells", value: String(s?.sellCount ?? 0), note: s?.sellValueUsd ? big(s.sellValueUsd) : undefined },
            { label: "Planned (10b5-1) sales excluded", value: String(s?.plannedSalesExcluded ?? 0) },
            { label: "Insider score", value: insScore == null ? "—" : `${insScore > 0 ? "+" : ""}${insScore}` },
            ...((ins?.transactions ?? []).slice(0, 6).map((t) => ({
              label: `${t.date} · ${t.insider}`,
              value: `${t.code === "P" ? "BUY" : "SELL"} ${big(t.value)}`,
              note: t.role,
            })) as Row[]),
          ],
        },
      ],
      method:
        "Agree → average plus an agreement bonus; disagree → insider flow leads (it's the informed signal), dampened. Buys count 3× sales " +
        "(insiders sell for many reasons, buy for one); planned 10b5-1 sales are ignored; one trade can't make a maximal score.",
      sources: ["Yahoo daily prices", "SEC EDGAR Form 4 filings"],
    },
  };
}

// ── 4. Analysts & earnings ───────────────────────────────────────────────────
function analystCard(e: EarningsOutlook | null, target: number | null, price: number | null): ModelCard {
  const up = e?.revisionsUp ?? null;
  const dn = e?.revisionsDown ?? null;
  // Revision balance, shrunk by how many revisions there were (one revision
  // can't read as a maximal signal): n=1 → ×0.28, 3 → ×0.63, 6 → ×0.86.
  const nRev = (up ?? 0) + (dn ?? 0);
  const rev = up != null && dn != null && nRev > 0 ? ((up - dn) / nRev) * (1 - Math.exp(-nRev / 3)) : null;
  const upside = target && price ? target / price - 1 : null;
  const growth = e?.consensusEps != null && e?.epsYearAgo != null && Math.abs(e.epsYearAgo) > 0.01 ? e.consensusEps / Math.abs(e.epsYearAgo) - Math.sign(e.epsYearAgo) : null;
  const parts: { v: number; w: number }[] = [];
  if (rev != null) parts.push({ v: rev, w: 0.5 });
  if (upside != null) parts.push({ v: clamp(upside / 0.3), w: 0.3 });
  if (growth != null) parts.push({ v: clamp(growth / 0.3), w: 0.2 });
  const W = parts.reduce((s, p) => s + p.w, 0);
  const dir = W ? parts.reduce((s, p) => s + p.v * p.w, 0) / W : 0;
  const available = parts.length > 0;
  const coverage = W; // 1.0 when all three inputs exist
  const conv = available ? Math.round(Math.min(95, 100 * (1 - Math.exp(-Math.abs(dir) / 0.25)) * (0.5 + 0.5 * coverage))) : 0;
  const days = e?.date ? Math.round((Date.parse(e.date) - Date.now()) / 86400_000) : null;
  const bits = [
    rev != null ? `estimates ${rev > 0.15 ? "being raised" : rev < -0.15 ? "being cut" : "mostly steady"} (${up}↑ ${dn}↓ in 4 weeks)` : null,
    upside != null ? `Street target ${pct(upside, 0, true)} away` : null,
    e?.date ? `reports ${e.date}${days != null && days >= 0 ? ` (in ${days}d)` : ""}` : null,
  ].filter(Boolean);
  return {
    id: "analysts",
    name: "Analysts & earnings",
    question: "Are the people modelling the company getting more or less optimistic, and what's priced in?",
    available,
    call: available ? callOf(dir) : null,
    direction: dir,
    conviction: conv,
    headline: available ? bits.join("; ") + "." : "No analyst coverage data for this name.",
    weight: 0.2,
    breakdown: {
      sections: [
        {
          title: "Estimate revisions (last 4 weeks)",
          summary: "The best-documented analyst signal: the direction estimates are moving, not their level.",
          rows: [
            { label: "Revised up", value: up == null ? "—" : String(up) },
            { label: "Revised down", value: dn == null ? "—" : String(dn) },
            { label: "Signal (balance × evidence)", value: rev == null ? "—" : `${rev > 0 ? "+" : ""}${(rev * 100).toFixed(0)}`, note: "A single revision counts for ~28% of a full signal." },
          ],
        },
        {
          title: "Next earnings",
          rows: [
            { label: "Date", value: e?.date ?? "—", note: e?.dateIsEstimate ? "estimated from past reporting dates" : undefined },
            { label: "Quarter", value: e?.fiscalQuarter ?? "—" },
            { label: "Consensus EPS", value: e?.consensusEps != null ? `$${e.consensusEps.toFixed(2)}` : "—", note: e?.nEstimates ? `${e.nEstimates} analysts` : undefined },
            { label: "Same quarter last year", value: e?.epsYearAgo != null ? `$${e.epsYearAgo.toFixed(2)}` : "—" },
            { label: "Expected EPS growth", value: pct(growth, 0, true) },
          ],
        },
        {
          title: "Street price target",
          rows: [
            { label: "1-year target", value: target ? `$${target.toFixed(2)}` : "—" },
            { label: "Implied move", value: pct(upside, 1, true), note: "Targets are sticky and optimistic on average — weighted lightly." },
          ],
        },
      ],
      method: "Revision balance (50%), target upside (30%, ±30% saturates), expected EPS growth (20%, ±30% saturates). Conviction scales with the size of the lean and how many of the three inputs exist.",
      sources: ["Nasdaq / Zacks consensus & revisions", "Nasdaq quote summary"],
    },
  };
}

// ── 5. Macro fit ─────────────────────────────────────────────────────────────
type MacroTracker = { as_of: string; regime: string; sectors: { etf: string; sector: string; sentiment: number; note: string }[] };
type AuroraLite = {
  as_of: string;
  regime: { label: string | null; confidence: string } | null;
  tilt: { factors: { name: string; lean: string; rationale: string }[]; sectors: { name: string; lean: string; rationale: string }[] } | null;
};
function macroCard(a: LiveAnalysis, etf: string, mt: MacroTracker | null, au: AuroraLite | null, fundScore: { health: number | null }): ModelCard {
  const sec = mt?.sectors.find((s) => s.etf === etf) ?? null;
  const rows: Row[] = [];
  const parts: { v: number; w: number; why: string }[] = [];
  if (sec) {
    parts.push({ v: sec.sentiment / 100, w: 0.6, why: `${sec.sector} ${sec.sentiment >= 0 ? "leading" : "lagging"} the market` });
    rows.push({ label: `Sector rotation (${etf})`, value: `${sec.sentiment > 0 ? "+" : ""}${sec.sentiment}`, note: sec.note });
  }
  // Aurora tilt → does this stock fit the regime's preferred exposures?
  const vol = a.security.risk?.realized_vol ?? null;
  const pe = a.security.valuation?.pe ?? null;
  const longDuration = etf === "XLK" && (pe == null || pe > 30);
  let tiltScore = 0;
  let tiltN = 0;
  for (const f of au?.tilt?.factors ?? []) {
    const sign = f.lean === "overweight" ? 1 : f.lean === "underweight" ? -1 : 0;
    if (!sign) continue;
    let has: boolean | null = null;
    if (f.name === "quality") has = fundScore.health != null ? fundScore.health >= 70 : null;
    if (f.name === "low_volatility") has = vol != null ? vol < 0.25 : null;
    if (f.name === "duration") has = longDuration || (pe != null && pe > 35);
    if (has == null) continue;
    tiltScore += sign * (has ? 1 : -0.3);
    tiltN++;
    rows.push({ label: `Regime wants: ${f.lean} ${f.name.replace("_", " ")}`, value: has ? "✓ fits" : "✗ doesn't", note: f.rationale });
  }
  const sectorKey: Record<string, string> = { XLU: "utilities", XLP: "consumer_staples", XLRE: "homebuilders_REITs" };
  for (const s of au?.tilt?.sectors ?? []) {
    const match = sectorKey[etf] === s.name || (s.name === "long_duration_tech" && longDuration);
    if (!match) continue;
    const sign = s.lean === "overweight" ? 1 : s.lean === "underweight" ? -1 : 0;
    tiltScore += sign;
    tiltN++;
    rows.push({ label: `Regime wants: ${s.lean} ${s.name.replace(/_/g, " ")}`, value: "applies", note: s.rationale });
  }
  if (tiltN) {
    const t = clamp(tiltScore / tiltN);
    const word = t >= 0.4 ? "strongly favours" : t > 0.05 ? "mildly favours" : t <= -0.4 ? "works against" : t < -0.05 ? "is a mild headwind for" : "is neutral for";
    parts.push({ v: t, w: 0.4, why: `${au?.regime?.label ?? "the regime"} ${word} this profile` });
  }
  const W = parts.reduce((s, p) => s + p.w, 0);
  const dir = W ? parts.reduce((s, p) => s + p.v * p.w, 0) / W : 0;
  const available = parts.length > 0;
  return {
    id: "macro",
    name: "Macro fit",
    question: "Does the economic backdrop favour this kind of stock right now?",
    available,
    call: available ? callOf(dir) : null,
    direction: dir,
    conviction: available ? Math.round(Math.min(90, 100 * (1 - Math.exp(-Math.abs(dir) / 0.3)) * (0.6 + 0.4 * W))) : 0,
    headline: available ? `${parts.map((p) => p.why).join("; ")}.` : "No macro read available.",
    weight: 0.16,
    breakdown: {
      sections: [
        { title: `Regime: ${au?.regime?.label ?? "—"} (${au?.regime?.confidence ?? "—"} confidence)`, summary: mt?.regime, rows },
      ],
      method:
        "Sector rotation (60%): the stock's sector ETF trend vs the S&P. Regime fit (40%): Aurora's macro regime names the exposures it favours " +
        "(quality, low volatility, short duration…); we check whether this stock has them (health ≥70, vol <25%, P/E ≤35).",
      sources: [`Macro tracker (as of ${mt?.as_of ?? "—"})`, `Aurora DSGE + FRED (as of ${au?.as_of ?? "—"})`],
    },
  };
}

// ── 6. Relative value vs sector ──────────────────────────────────────────────
function relValueCard(rv: RelValue | null): ModelCard {
  const available = rv != null;
  const z = rv?.z ?? null;
  const dir = z == null ? 0 : clamp(-z / 3); // stretched rich vs sector → lean short (convergence)
  const conv = z == null ? 0 : Math.round(Math.min(90, (Math.abs(z) / 2.5) * 70 * (rv!.evidence === "strong" ? 1.15 : 0.85)));
  const headline = !rv
    ? "Not enough overlapping history with its sector."
    : !rv.cointegrated
      ? `Not statistically tied to ${rv.etf} — no relative-value signal (it's ${pct(rv.rel3m, 0, true)} vs the sector over 3 months).`
      : `Tied to ${rv.etf} (${rv.evidence} evidence); now ${z! > 0 ? "rich" : "cheap"} vs it by ${Math.abs(z!).toFixed(1)}σ${rv.halfLife ? `, typically halves in ~${Math.round(rv.halfLife)}d` : ""}.`;
  return {
    id: "relvalue",
    name: "Relative value",
    question: "Has it drifted unusually far from its own sector?",
    available,
    call: available ? callOf(dir) : null,
    direction: rv?.cointegrated ? dir : 0,
    conviction: rv?.cointegrated ? conv : 0,
    headline,
    weight: 0.12,
    breakdown: {
      sections: [
        {
          title: `Engle-Granger test vs ${rv?.etf ?? "sector"}`,
          rows: [
            { label: "ADF t-statistic", value: fx(rv?.adfT), note: "Below −3.34 = cointegrated at 5%; below −3.90 = at 1% (MacKinnon)." },
            { label: "Evidence", value: rv?.evidence ?? "—" },
            { label: "Hedge ratio", value: fx(rv?.hedge), note: "Stock move per 1% sector move in the long-run relationship." },
            { label: "Spread z-score", value: z == null ? "—" : `${z > 0 ? "+" : ""}${z.toFixed(2)}σ` },
            { label: "Half-life", value: rv?.halfLife ? `${Math.round(rv.halfLife)} days` : "—" },
            { label: "3-month return vs sector", value: pct(rv?.rel3m, 1, true) },
          ],
        },
      ],
      method:
        "Regress log price on the sector ETF's log price over a year, then test the residual for stationarity (ADF with one lag). Only a real, tested tie produces a signal; a stretched spread points toward convergence.",
      sources: ["Yahoo daily prices (stock and sector ETF)"],
    },
  };
}

// ── weekly ranking (if the name is in the weekly universe) ───────────────────
type WeeklyExport = { as_of: string; forecasts: { ticker: string; decile: number; expected_relative_return: number }[]; validation: { ridge_mean_rank_ic: number } };
function weeklyCard(w: WeeklyExport | null, ticker: string): ModelCard | null {
  const f = w?.forecasts.find((x) => x.ticker === ticker);
  if (!f || !w) return null;
  const dir = (f.decile - 5.5) / 4.5;
  return {
    id: "weekly",
    name: "Weekly ranking",
    question: "Where does it rank for the coming week vs the rest of our list?",
    available: true,
    call: callOf(dir * 0.5),
    direction: 0,
    conviction: Math.round(Math.abs(dir) * 35),
    headline: `Decile ${f.decile} of 10 in the weekly cross-section (as of ${w.as_of}).`,
    weight: 0,
    breakdown: {
      sections: [{ title: "Weekly model", rows: [
        { label: "Decile", value: String(f.decile) },
        { label: "Out-of-sample rank IC", value: fx(w.validation.ridge_mean_rank_ic, 3), note: "Weak skill — shown for context, doesn't vote." },
      ] }],
      method: "Cross-sectional ridge model over 16 names, walk-forward validated. Its tested skill is low, so it doesn't vote in the desk view.",
      sources: ["weekly-engine export"],
    },
  };
}

// The desk's weighted vote — ONE function, used by the page and by the
// "push back" what-if so the two can never disagree on the math.
//   score      = Σ wᵢ·dirᵢ / Σ wᵢ   over models with data
//   conviction = strength(|score|) × agreement × coverage
//     strength  = 1 − e^(−|score|/0.2)
//     agreement = 0.55 + 0.45 · (weight agreeing with the call / total weight)
//     coverage  = 0.6 + 0.4 · (weight with data / full weight)
export function deskView(voting: Pick<ModelCard, "weight" | "direction">[]) {
  const W = voting.reduce((t, c) => t + c.weight, 0);
  const score = W ? voting.reduce((t, c) => t + c.weight * c.direction, 0) / W : 0;
  const sign = Math.sign(score) || 1;
  const agreeW = voting.filter((c) => Math.sign(c.direction) === sign && Math.abs(c.direction) > 0.05).reduce((t, c) => t + c.weight, 0);
  const agreement = W ? agreeW / W : 0;
  const conviction = Math.round(
    Math.min(95, 100 * (1 - Math.exp(-Math.abs(score) / 0.2)) * (0.55 + 0.45 * agreement) * (0.6 + 0.4 * Math.min(1, W / 1))),
  );
  return { score, call: callOf(score), conviction };
}

// ═══════════════════════════════════════════════════════════════════════════
export async function runDesk(raw: string): Promise<DeskResult | null> {
  const a = await analyzeTicker(raw);
  if (!a) return null;
  const s = a.security;
  const ticker = s.ticker;
  const etf = etfFor(a.profile?.sector ?? null, s.sic);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

  const [earn, sectorBars, ins, mt, au, wk] = await Promise.all([
    earningsOutlook(ticker),
    etf !== "SPY" ? dailyBars(etf) : dailyBars("SPY"),
    a.cik ? insiderFor(ticker, a.cik, since, 40).catch(() => null) : Promise.resolve(null),
    readJson<MacroTracker>("macro-tracker/latest.json"),
    readJson<AuroraLite>("aurora/latest.json"),
    readJson<WeeklyExport>("weekly/latest.json"),
  ]);

  const evidence: TradeEvidence = {
    source: "Live (SEC + Yahoo)",
    confidence: s.confidence,
    asOf: s.as_of,
    risk: s.risk as unknown as TradeEvidence["risk"],
    quality: s.quality as unknown as TradeEvidence["quality"],
    valuation: s.valuation as unknown as TradeEvidence["valuation"],
    flags: [...s.data_quality.flags, ...(s.valuation?.flags ?? [])],
  };
  const verdict = equityVerdict({ quality: s.quality, valuation: s.valuation, risk: s.risk });

  const fund = fundamentalsCard(verdict, a);
  const mom = momentumCard(a, ins);
  const ana = analystCard(earn, a.profile?.target1y ?? null, a.quote.price);
  const mac = macroCard(a, etf, mt, au, { health: verdict.health.score });
  const rv = relValueCard(sectorBars && etf !== "SPY" ? relativeValue(a.bars, sectorBars.bars, etf) : null);
  const voting = [fund, mom, ana, mac, rv].filter((c) => c.available);

  // ── desk view ──
  const dv = deskView(voting);
  const { score, call, conviction } = dv;
  const sign = Math.sign(score) || 1;
  const against = voting.filter((c) => Math.sign(c.direction) === -sign && Math.abs(c.direction) > 0.05);

  // Stress test + entry/exit on the desk's side.
  const side: "long" | "short" = score < 0 ? "short" : "long";
  const [stress, plan] = await Promise.all([
    distresse.evaluate({ ticker, instrument: side, thesis: "", evidence }),
    intraExitus.plan({ ticker, instrument: side, thesis: "", evidence }),
  ]);
  const cards = [fund, mom, ana, mac, rv, stressCard(stress, side)];
  const wc = weeklyCard(wk, ticker);
  if (wc) cards.push(wc);

  const strongest = [...voting].sort((x, y) => Math.abs(y.direction * y.weight) - Math.abs(x.direction * x.weight))[0];
  const summary =
    call === "Neutral"
      ? `The models cancel out — ${against.length ? `${against.map((c) => c.name).join(" and ")} pull${against.length === 1 ? "s" : ""} the other way` : "no strong lean anywhere"}. No edge; wait for a catalyst or a better price.`
      : `${call}. ${strongest ? `${strongest.name} carries the call` : ""}${against.length ? `; ${against.map((c) => c.name).join(" and ")} disagree${against.length === 1 ? "s" : ""}` : "; nothing material pushes back"}.`;

  const r = s.risk;
  const v = s.valuation;
  const stats: Row[] = [
    { label: "Market cap", value: big(v?.market_cap ?? a.profile?.marketCap) },
    { label: "P/E (TTM)", value: fx(v?.pe, 1) },
    { label: "FCF yield", value: pct(v?.fcf_yield) },
    { label: "12-mo momentum", value: pct(r?.mom_12_1, 0, true) },
    { label: "Volatility", value: pct(r?.realized_vol, 0) },
    { label: "Beta", value: fx(r?.beta_mkt) },
    { label: "Next earnings", value: earn?.date ?? "—" },
    { label: "Street target", value: a.profile?.target1y ? `$${a.profile.target1y.toFixed(0)}` : "—" },
  ];

  return {
    ticker,
    name: s.name ?? ticker,
    exchange: a.exchange,
    sector: a.profile?.sector ?? null,
    industry: a.profile?.industry ?? s.sector,
    quote: a.quote,
    spark: a.bars.slice(-252).map((b) => ({ date: b.date, close: b.rawClose })),
    stats,
    view: {
      call,
      conviction,
      score,
      summary,
      agree: voting.filter((c) => Math.sign(c.direction) === sign && Math.abs(c.direction) > 0.05).map((c) => c.name),
      disagree: against.map((c) => c.name),
    },
    cards,
    plan,
    stress,
    earnings: earn,
    flags: evidence.flags ?? [],
    asOf: s.as_of,
  };
}
