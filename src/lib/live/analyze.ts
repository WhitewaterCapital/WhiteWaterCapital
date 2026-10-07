import "server-only";
import type { SecurityAnalysis, QualityRead, ValuationRead, Confidence } from "@/lib/models/incepta-export";
import { dailyBars, type Bar, type Quote } from "./yahoo";
import { cikFor, companyFacts, submissions, standardize, piotroski, type Fundamentals } from "./sec";
import { riskFeatures } from "./risk";
import { nasdaqSummary, type NasdaqSummary } from "./nasdaq";

// ---------------------------------------------------------------------------
// Analyze ANY ticker, live: Yahoo prices + SEC XBRL fundamentals → the same
// SecurityAnalysis shape the pre-computed Incepta universe uses, so every model
// (equity read, Distresse, Intra/Exitus, momentum…) runs on it unchanged.
// Works on Vercel (no Python). Missing pieces are null + flagged, never guessed.
// ---------------------------------------------------------------------------

export type LiveAnalysis = {
  security: SecurityAnalysis;
  quote: Quote;
  bars: Bar[]; // full adjusted history (for charts / relative-value tests)
  fundamentals: Fundamentals | null;
  cik: number | null;
  exchange: string | null;
  profile: NasdaqSummary | null; // sector/industry/market cap/Street target
};

const ratio = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && b !== 0 ? a / b : null;

export async function analyzeTicker(raw: string): Promise<LiveAnalysis | null> {
  const ticker = raw.trim().toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(ticker)) return null;

  const [px, spy, cik, profile] = await Promise.all([
    dailyBars(ticker),
    dailyBars("SPY"),
    cikFor(ticker),
    nasdaqSummary(ticker),
  ]);
  if (!px || px.bars.length < 5) return null; // unknown symbol

  const [cf, subs] = cik ? await Promise.all([companyFacts(cik), submissions(cik)]) : [null, null];
  const f = cf ? standardize(cf) : null;
  const flags: string[] = [];

  const risk = riskFeatures(px.bars, spy?.bars ?? null);
  const price = px.quote.price ?? px.bars.at(-1)!.rawClose;

  // ── quality (latest fiscal year vs the one before — like-for-like) ────────
  let quality: QualityRead | null = null;
  if (f && f.periodEnd) {
    const c = f.fy;
    const p = f.fyPrior;
    const fcf = c.operating_cash_flow != null && c.capex != null ? c.operating_cash_flow - Math.abs(c.capex) : null;
    const pio = piotroski(c, p);
    quality = {
      period_end: f.periodEnd,
      roa: ratio(c.net_income, c.assets),
      roe: c.equity != null && c.equity > 0 ? ratio(c.net_income, c.equity) : null,
      gross_margin: ratio(c.gross_profit, c.revenue),
      net_margin: ratio(c.net_income, c.revenue),
      fcf_margin: ratio(fcf, c.revenue),
      leverage: ratio(c.long_term_debt, c.assets),
      rev_growth: c.revenue && p.revenue ? c.revenue / p.revenue - 1 : null,
      piotroski_f: pio.max ? pio.score : null,
      piotroski_max: pio.max || null,
    };
  } else if (cik) {
    flags.push("no XBRL financial statements found");
  } else {
    flags.push("not an SEC filer (fund, ETF or foreign listing) — price-based read only");
  }

  // ── valuation (TTM earnings/cash flow, latest balance sheet, live price) ──
  let valuation: ValuationRead | null = null;
  const sic = subs?.sic ?? null;
  if (f) {
    const vflags: string[] = [];
    const usd = f.currency === "USD" && (px.quote.currency ?? "USD") === "USD";
    if (!usd) {
      vflags.push(`reports in ${f.currency} (${f.taxonomy}) — multiples not computed across currencies/ADR ratios`);
    } else if (!f.shares && !profile?.marketCap) {
      vflags.push("no share count or market cap → cannot value");
    }
    // Market cap: Nasdaq's figure when available (correct for multi-class
    // names — BRK's dei share count mixes A and B shares), else price × shares.
    const fromShares = f.shares ? price * f.shares : null;
    const mcNasdaq = profile?.marketCap ?? null;
    if (usd && mcNasdaq && fromShares && Math.abs(fromShares / mcNasdaq - 1) > 0.25) {
      vflags.push("share count ≠ market cap (multiple share classes?) — using exchange market cap");
    }
    if (usd && (mcNasdaq || fromShares)) {
      const mc = (mcNasdaq ?? fromShares)!;
      const ni = f.ttm.net_income;
      const rev = f.ttm.revenue;
      const ocf = f.ttm.operating_cash_flow;
      const capex = f.ttm.capex;
      const eq = f.latest.equity;
      const debt = f.latest.long_term_debt;
      const cash = f.latest.cash;
      if (ni == null || ni <= 0) vflags.push("negative/zero earnings → P/E not meaningful");
      if (eq == null || eq <= 0) vflags.push("negative/zero book equity → P/B not meaningful");
      // EV only when debt is KNOWN (an unknown debt figure understates EV —
      // the bug that made Ford look absurdly cheap).
      const ev = debt != null ? mc + debt - (cash ?? 0) : null;
      if (debt == null) vflags.push("total debt not in filings → EV multiples skipped");
      const code = Number(sic);
      if (code >= 6000 && code <= 6199) vflags.push("bank/finance (SIC): EV/EBITDA & FCF unreliable; use P/B, P/TBV");
      else if (code >= 6200 && code <= 6799) vflags.push("insurer/REIT (SIC): use P/B/NAV/FFO, not P/E or EV");
      valuation = {
        market_cap: mc,
        pe: ni != null && ni > 0 ? mc / ni : null,
        earnings_yield: ni != null && ni > 0 ? ni / mc : null,
        pb: eq != null && eq > 0 ? mc / eq : null,
        ps: ratio(mc, rev),
        fcf_yield: ocf != null && capex != null ? (ocf - Math.abs(capex)) / mc : null,
        ev,
        ev_sales: ev != null ? ratio(ev, rev) : null,
        flags: vflags,
      };
    } else {
      valuation = { market_cap: null, pe: null, earnings_yield: null, pb: null, ps: null, fcf_yield: null, ev: null, ev_sales: null, flags: vflags };
    }
  }

  const asOf = px.bars.at(-1)!.date;
  const fundAgeDays = f?.periodEnd ? (Date.now() - Date.parse(f.periodEnd)) / 86400_000 : null;
  const stale = fundAgeDays != null && fundAgeDays > 550;
  if (stale) flags.push(`latest annual report is ${Math.round(fundAgeDays! / 30)} months old`);
  const hasFund = quality != null;
  const confidence: Confidence = hasFund ? (flags.length || (valuation?.flags.length ?? 0) > 1 ? "medium" : "high") : "low";

  return {
    security: {
      ticker,
      // Yahoo's display name ("The Coca-Cola Company") over SEC's ("COCA COLA CO").
      name: px.quote.name ?? subs?.name ?? null,
      sector: profile?.industry ?? subs?.sicDescription ?? null,
      sic,
      as_of: asOf,
      data_quality: {
        has_prices: true,
        has_fundamentals: hasFund,
        fundamentals_period_end: f?.periodEnd ?? null,
        price_last_close: px.bars.at(-1)!.rawClose,
        stale,
        flags,
      },
      confidence,
      risk,
      quality,
      valuation,
    },
    quote: px.quote,
    bars: px.bars,
    fundamentals: f,
    cik,
    exchange: px.quote.exchange,
    profile,
  };
}
