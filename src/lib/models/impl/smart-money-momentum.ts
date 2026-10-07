import type { EquityModel, EquityReading, EquitySignal } from "../types";
import { fetchInsiderTransactions } from "@/lib/whitewatch-data/edgar-sources";
import { ownMomentum, combineInsiderMomentum, type MomentumRead } from "../momentum";

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE 2026-10 — now runs on REAL inputs end to end:
//   • momentum = the stock's OWN 12-1 return from the Incepta export (real
//     prices), replacing the Mom FACTOR BETA from WW-Factor (a style loading,
//     and synthetic-demo at the time);
//   • insider flow = real SEC Form 4 open-market trades (public/data/insider,
//     `npm run refresh:insider`), replacing a hard-coded synthetic table.
//   • combination rule = combineInsiderMomentum() in ../momentum.ts (agree →
//     average + bonus; clash → insider leads, dampened).
// The older notes below describe the original construction.
// ═══════════════════════════════════════════════════════════════════════════
// Smart Money Momentum — an EquityModel (PLATFORM_REBUILD_PLAN.md priority
// #11). A cross-sectional screen combining two signals this app already
// computes for real, over the same fixed universe WW-Factor already covers:
//
//   - WW-Insider's net insider buy/sell direction, over a trailing 90-day
//     window (SEC EDGAR Form 4 — the same source already powering Distresse's
//     Positioning/crowding dimension).
//   - WW-Factor's momentum ("Mom") factor beta from its Fama-French + Mom
//     regression (the same source already powering Distresse's Factor
//     exposure dimension).
//
// RESEARCH GROUNDING (see PLATFORM_REBUILD_PLAN.md "Quant model research"):
// academic work on insider Form 3/4 signals (Alpha Architect's review) and on
// combining insider ownership with momentum specifically (TEJ) supports using
// the two together rather than either alone — they capture different,
// complementary information. This screen is exactly that combination, and
// nothing more: no fabricated third ingredient, no options/IV data (this app
// has no free source for that — see the Options/Alpha Vantage roadblock).
//
// WHY THIS IS DIFFERENT FROM FactorPanel's "descriptive risk context only"
// rule (see that file's own top-of-file comment): a single name's momentum
// BETA, alone, really is purely descriptive — a negative Mom beta just means
// "style tilt away from recent winners," not a sell signal, so FactorPanel's
// numbers are deliberately never fed into conviction.ts's composite score.
// This model does something categorically different: it's a CROSS-SECTIONAL
// RELATIVE RANK across a small, fixed universe (not a single name's absolute
// score), and it combines the beta with a genuinely directional real input
// (insiders buying or selling with their own money) — which is the standard
// academic construction of a momentum-style factor screen, not a
// reinterpretation of what one beta means in isolation. Same rule still
// applies, though: this model's scores are NOT fed into conviction.ts either
// — it's a standalone screen, not an ingredient in any single-name verdict.
//
// HONESTY / ABSTENTION: a ticker appears in `signals` ONLY when BOTH real
// inputs are available for it (WW-Factor confidence === "ok" for that name,
// AND at least one signal Form 4 transaction in the trailing window). A name
// missing either input is left OUT of `signals` entirely — never given a
// fabricated neutral score — and the gap is named plainly in `summary`.
// AS OF 2026-09-13, WW-Factor's live export only covers 3 synthetic-demo
// tickers (DEMO-A/B/C; see PLATFORM_REBUILD_PLAN.md's Roadblocks) — until
// factor-engine is re-run against real Tiingo data for this universe, EVERY
// name below will correctly show empty, not because this screen is broken,
// but because its one real momentum-beta input doesn't cover any real ticker
// yet. That is intentional honest-but-empty scaffolding, the same pattern
// this whole codebase already uses elsewhere, not a bug to hide.
// ═══════════════════════════════════════════════════════════════════════════

// The same 6-name universe WW-Factor's own fixed universe already targets
// (and the same set Intra/Exitus and Incepta already cover) — chosen for
// consistency across this session's cross-sectional work, not invented fresh.
export const SMART_MONEY_UNIVERSE = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "KO"] as const;

const INSIDER_WINDOW_DAYS = 90;


type InsiderRead = { score: number; netWord: string; buyCount: number; sellCount: number; distinctInsiders: number };

async function insiderForTicker(ticker: string): Promise<InsiderRead | { unavailable: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = await fetchInsiderTransactions(ticker, { windowDays: INSIDER_WINDOW_DAYS });
  } catch (err) {
    return { unavailable: `couldn't reach SEC EDGAR: ${(err as Error).message}` };
  }
  if (raw.status === "not_found" || raw.status === "unreachable") {
    return { unavailable: raw.message ?? `no insider-activity read for ${ticker}` };
  }
  const summary = raw.summary;
  if (!summary || summary.signalTransactionCount === 0) {
    return { unavailable: `no open-market insider buy/sell filings for ${ticker} in the trailing ${raw.windowDays ?? INSIDER_WINDOW_DAYS} days` };
  }
  return {
    score: summary.score ?? 0,
    netWord: summary.netDirection > 0 ? "net buyers" : summary.netDirection < 0 ? "net sellers" : "mixed",
    buyCount: summary.buyCount,
    sellCount: summary.sellCount,
    distinctInsiders: summary.distinctInsiders,
  };
}

export const smartMoneyMomentum: EquityModel = {
  meta: {
    id: "smart-money-momentum",
    name: "Smart Money Momentum",
    kind: "equity",
    status: "live",
    tagline: "Real insider buying (SEC Form 4) × 12-month price momentum, over a fixed 6-name universe.",
    description:
      "Commits to a side on every name in its universe from real evidence: the stock's own 12-month price momentum and open-market insider buying/selling from SEC Form 4 filings. Ranks the universe most-favoured to least, states a confidence level per name, and only calls a name 'balanced' when the evidence is genuinely split — it never sits a name out just because one input is missing. Combining insider direction with momentum follows the academic work referenced in PLATFORM_REBUILD_PLAN.md.",
  },

  async read(dateISO: string): Promise<EquityReading> {
    const rows = await Promise.all(
      SMART_MONEY_UNIVERSE.map(async (ticker) => {
        const [mom, insider] = await Promise.all([ownMomentum(ticker), insiderForTicker(ticker)]);
        return { ticker, mom, insider };
      }),
    );

    const signals: EquitySignal[] = [];
    const noData: string[] = [];

    for (const { ticker, mom, insider } of rows) {
      const momOk = !("unavailable" in mom);
      const insOk = !("unavailable" in insider);

      // Only genuinely no-data names are dropped — and momentum is essentially
      // always present, so this is rare, not the default hedge it used to be.
      if (!momOk && !insOk) {
        noData.push(ticker);
        continue;
      }

      const m = momOk ? (mom as MomentumRead) : null;
      const ins = insOk ? (insider as InsiderRead) : null;
      const score = combineInsiderMomentum(ins?.score ?? null, m?.tilt ?? null);

      // Commit to a side; "balanced" only on an exact tie.
      const side =
        score > 0
          ? score >= 40 ? "Long" : score >= 15 ? "Lean long" : "Slight long lean"
          : score < 0
            ? score <= -40 ? "Short / avoid" : score <= -15 ? "Lean short" : "Slight short lean"
            : "Balanced — no edge here";

      const agree = m && ins && Math.sign(m.tilt) === Math.sign(ins.score);
      const confidence =
        m && ins
          ? agree
            ? Math.abs(score) >= 40
              ? "high — price trend and insiders agree"
              : "moderate — price trend and insiders agree, modestly"
            : "contested — insiders lead against the price trend"
          : Math.abs(score) >= 40
            ? "moderate — strong price trend; insiders quiet"
            : "low — mild price trend; insiders quiet";

      const momPart = m
        ? `12-month momentum ${m.mom12_1 >= 0 ? "+" : ""}${(m.mom12_1 * 100).toFixed(0)}%` +
          (m.ret1m != null ? ` (last month ${m.ret1m >= 0 ? "+" : ""}${(m.ret1m * 100).toFixed(1)}%)` : "")
        : "momentum unavailable";
      const insPart = ins
        ? `insiders ${ins.netWord} (${ins.buyCount} buy / ${ins.sellCount} sell, ${ins.distinctInsiders} insider${ins.distinctInsiders === 1 ? "" : "s"}, SEC Form 4)`
        : "no discretionary insider trades in the window";

      signals.push({
        symbol: ticker,
        score,
        note: `${side}. Evidence: ${momPart}; ${insPart}. Confidence: ${confidence}.`,
      });
    }

    signals.sort((a, b) => b.score - a.score);
    const breadth = signals.length > 0 ? Math.round(signals.reduce((s, x) => s + x.score, 0) / signals.length) : 0;

    const stance =
      breadth > 4 ? "leans net-long" : breadth < -4 ? "leans net-short" : "is roughly balanced across the group";
    const noDataLine = noData.length > 0 ? ` No signal available for ${noData.join(", ")}.` : "";
    const summary =
      `Across ${SMART_MONEY_UNIVERSE.length} names the smart-money read ${stance} ` +
      `(net ${breadth >= 0 ? "+" : ""}${breadth}). Every name gets a committed side from the evidence available — ` +
      `real 12-month price momentum plus SEC Form 4 insider buying/selling (90 days, planned sales excluded).${noDataLine}`;

    return {
      date: dateISO,
      breadth,
      signals,
      summary,
      generatedBy: "Smart Money Momentum",
    };
  },
};
