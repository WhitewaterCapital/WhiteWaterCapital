import type { EquityModel, EquityReading, EquitySignal } from "../types";
import { getFactorExport } from "@/lib/factor";
import { fetchInsiderTransactions } from "@/lib/whitewatch-data/edgar-sources";
import { getEarningsExport } from "@/lib/earnings";

// ═══════════════════════════════════════════════════════════════════════════
// Earnings Move — an EquityModel. Built 2026-09-14 in direct response to
// "it can see what earnings are upcoming and predict which way the stock
// will go on the earnings" — read plainly rather than promised in full: see
// research/equity-model-research-dossier.md's own "Earnings-surprise
// direction" row (Medium confidence — needs analyst estimate data with
// poor free coverage) and its explicit rule, "Directional single-name
// forecasting is low-signal; express as probabilistic... never a point
// price." This model does NOT predict a surprise sign or a price move.
//
// WHAT IT ACTUALLY DOES: flags which names in the fixed universe have a
// confirmed print inside WW-EARNINGS' lookahead window (earnings-engine/),
// and attaches this repo's own two already-real positioning signals to each
// one — exactly the "insider activity + factor loadings as the closest
// real proxy we actually have" the platform's own crowding research
// (PLATFORM_REBUILD_PLAN.md, "Research grounding") already settled on when
// it hit the same missing-real-signal problem for a different feature.
// Nothing here is a new statistical model; it is a new COMBINATION of three
// (now four — see TIER C below) signals that were each already real and
// already live elsewhere in this app or in this engine's own history,
// following exactly the pattern smart-money-momentum.ts set.
//
// TIER B UPDATE (same day, same session): the dossier's "poor free
// coverage" verdict on analyst estimates was re-checked against current
// (2026) provider terms rather than taken as permanently settled — see
// earnings-engine/ee/adapters/alpha_vantage_estimates.py's docstring for
// the full survey. Result: PARTIALLY real now, not still fully deferred.
// Financial Modeling Prep (confirmed, its own pricing page) and Finnhub
// (inconclusive — its docs are an unreadable JS SPA from this session's
// tooling, third-party sources disagree) do not give a clean free path.
// Alpha Vantage's EARNINGS_CALENDAR (forward consensus EPS) and EARNINGS
// (trailing actual/estimate/surprise history) functions are well-evidenced
// (not live-fetch-confirmed — see that adapter's docstring) as free, and
// earnings-engine/ee/sue.py now has a fully real, fully tested
// Standardized-Unexpected-Earnings calculator built against them. What
// this model surfaces below (`estimateNote`) is real plumbing, not a
// fabricated number: on every ticker it will currently read as "estimate
// unavailable" (ALPHA_VANTAGE_API_KEY isn't set anywhere this repo has
// been run, and even once it is, the adapter itself is still an honest
// stub — same "wired but not network-exercised" state fmp_calendar.py was
// in before this session) or, once an estimate IS wired up, "SUE
// unavailable — not yet reported": WW-EARNINGS only ever exports PRE-print
// events (report_date in the future), and SUE is mathematically undefined
// before the actual EPS behind it exists. That is a structural property of
// this calendar engine, not a missing-data gap — a future retrospective/
// eval script is the right place to ever see a non-null SUE, not this
// live "what's coming up" reading.
//
// TIER C UPDATE (same day, same session, built right after Tier B):
// revision momentum (direction/magnitude of recent estimate changes) was
// NOT deferred after all — earnings-engine/ee/revisions.py now records
// this engine's own eps_estimate for every ticker on every export run
// (live OR synthetic-demo — see that module's docstring for why this needs
// no vendor at all) into an append-only snapshot log, and computes a REAL
// day-over-day revision read from that log's own PRIOR history once a
// second real run exists. `revisionNote` below is, like `estimateNote`,
// real plumbing over an honestly-computed field, never a fabricated
// number: on this engine's FIRST-EVER run for a given ticker (the common,
// expected state early in this log's life) it reads as "revision momentum
// unavailable (insufficient snapshot history...)" — not a bug, the same
// honest-abstention shape SUE has pre-print. Once at least two real runs
// on two different `as_of` dates exist, it reads as a real, signed percent
// change ("consensus estimate raised/lowered N% vs. this engine's own
// prior recorded run").
//
// HONESTY / ABSTENTION (same contract as smart-money-momentum.ts): a
// ticker appears in `signals` ONLY when WW-EARNINGS has an event for it in
// the current export. Insider positioning is attached when available and
// stated as unavailable, by name, when not — it is never required for the
// ticker to appear, since "no signal Form 4 activity" is itself real
// information, not a gap. Factor momentum is shown as separate context,
// never blended into the directional lean, for the same reason
// FactorPanel.tsx never feeds a raw beta into a signed score. The Tier-B
// estimate/SUE read and the Tier-C revision-momentum read follow the
// identical rule: each shown as its own separate context line, never
// blended into `lean`/`score`, and each always carries its own stated
// abstain reason rather than a bare null.
//
// `lean` is deliberately built from ONE directional ingredient (insider
// net buy/sell) with an explicit rule stated in the note, not a fabricated
// probability. When WW-EARNINGS' export itself is `data_provenance:
// "synthetic-demo"` (no FMP_API_KEY configured — see earnings-engine/
// README.md) the whole reading says so plainly and should not be read as a
// real calendar.
// ═══════════════════════════════════════════════════════════════════════════

// Same fixed universe WW-Factor / Smart Money Momentum / WW-EARNINGS all
// already target — consistency across the platform's cross-sectional work,
// not invented fresh here.
export const EARNINGS_MOVE_UNIVERSE = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "KO"] as const;

const INSIDER_PRE_PRINT_WINDOW_DAYS = 30;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type MomentumContext = { beta: number; significant: boolean; r2: number | null } | { unavailable: string };

async function momentumContextFor(ticker: string): Promise<MomentumContext> {
  const data = await getFactorExport();
  if (!data) return { unavailable: "WW-Factor hasn't exported yet" };
  const exposure = data.exposures.find((e) => e.ticker.toUpperCase() === ticker);
  if (!exposure) return { unavailable: `not in WW-Factor's current universe (${data.exposures.length} names covered)` };
  if (exposure.confidence !== "ok" || !exposure.betas) {
    return { unavailable: `WW-Factor abstains on ${ticker}: ${exposure.abstain_reason ?? exposure.confidence}` };
  }
  const mom = exposure.betas.find((b) => b.factor === "Mom");
  if (!mom) return { unavailable: `no Mom factor loading in this window for ${ticker}` };
  return { beta: mom.beta, significant: mom.significant, r2: exposure.r2 };
}

type InsiderRead = { score: number; netWord: string; buyCount: number; sellCount: number } | { unavailable: string };

async function insiderPrePrintFor(ticker: string): Promise<InsiderRead> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = await fetchInsiderTransactions(ticker, { windowDays: INSIDER_PRE_PRINT_WINDOW_DAYS });
  } catch (err) {
    return { unavailable: `couldn't reach SEC EDGAR: ${(err as Error).message}` };
  }
  if (raw.status === "not_found" || raw.status === "unreachable") {
    return { unavailable: raw.message ?? `no insider-activity read for ${ticker}` };
  }
  const summary = raw.summary;
  if (!summary || summary.signalTransactionCount === 0) {
    return { unavailable: `no open-market insider buy/sell filings for ${ticker} in the trailing ${raw.windowDays ?? INSIDER_PRE_PRINT_WINDOW_DAYS} days` };
  }
  return {
    score: summary.score ?? 0,
    netWord: summary.netDirection > 0 ? "net buyers" : summary.netDirection < 0 ? "net sellers" : "mixed",
    buyCount: summary.buyCount,
    sellCount: summary.sellCount,
  };
}

export const earningsMove: EquityModel = {
  meta: {
    id: "earnings-move",
    name: "Earnings Move",
    kind: "equity",
    status: "beta",
    tagline: "Who has a print coming up, and what this app's own real signals say going into it.",
    description:
      "Flags names with a confirmed earnings print in the lookahead window and commits to a pre-print lean for each — bullish or bearish going in — built from insider positioning and momentum, with insider flow leading when the two disagree. It reports how the desk is positioned into the event, deliberately NOT a prediction of which way the result lands (see the equity-model research dossier's 'Earnings-surprise direction' row on why single-name surprise-direction forecasting is low-signal).",
  },

  async read(dateISO: string): Promise<EquityReading> {
    const earningsExport = await getEarningsExport();

    if (!earningsExport) {
      return {
        date: dateISO,
        breadth: 0,
        signals: [],
        summary:
          "WW-EARNINGS hasn't exported yet (no public/data/earnings/latest.json) — run `python -m ee.export` in earnings-engine/. Nothing fabricated in its place.",
        generatedBy: "Earnings Move",
      };
    }

    const universeEvents = earningsExport.events.filter((e) =>
      (EARNINGS_MOVE_UNIVERSE as readonly string[]).includes(e.ticker.toUpperCase()),
    );

    const signals: EquitySignal[] = [];

    for (const event of universeEvents) {
      const [mom, insider] = await Promise.all([
        momentumContextFor(event.ticker),
        insiderPrePrintFor(event.ticker),
      ]);

      // Commit to a pre-print lean from BOTH directional inputs — insider
      // positioning and momentum — rather than sitting on "no lean". Insider
      // flow leads when the two disagree (it's the more event-specific signal).
      const momOk = !("unavailable" in mom);
      const insOk = !("unavailable" in insider);
      const momTilt = momOk ? clamp(mom.beta * 40, -100, 100) : null;
      const insScore = insOk ? clamp(insider.score, -100, 100) : null;
      const parts = [insScore, momTilt].filter((x): x is number => x != null);
      const score = parts.length ? clamp(Math.round(parts.reduce((a, b) => a + b, 0) / parts.length), -100, 100) : 0;

      const leanWord =
        score > 0
          ? score >= 25 ? "Bullish lean into the print" : "Slight bullish lean into the print"
          : score < 0
            ? score <= -25 ? "Bearish lean into the print" : "Slight bearish lean into the print"
            : "Balanced into the print — no directional edge";
      const agree = insScore != null && momTilt != null && insScore !== 0 && Math.sign(insScore) === Math.sign(momTilt);
      const basis =
        insOk && momOk
          ? agree
            ? "insider positioning and momentum both point that way"
            : "insider positioning and momentum disagree — insider flow leads"
          : insOk
            ? "from insider pre-print positioning"
            : "from momentum";
      const insWord = insOk
        ? `insiders ${insider.netWord} pre-print (${insider.buyCount} buy / ${insider.sellCount} sell over ${INSIDER_PRE_PRINT_WINDOW_DAYS}d)`
        : "insider positioning not available";
      const momWord = momOk ? `momentum beta ${mom.beta >= 0 ? "+" : ""}${mom.beta.toFixed(2)}` : "momentum not available";

      signals.push({
        symbol: event.ticker,
        score,
        note:
          `Reports ${event.report_date}${event.session ? ` (${event.session})` : ""}. ${leanWord} — ${basis}. ` +
          `Evidence: ${insWord}; ${momWord}. This is how the desk is positioned going in, not a prediction of the result.`,
      });
    }

    signals.sort((a, b) => b.score - a.score);
    const breadth = signals.length > 0 ? Math.round(signals.reduce((s, x) => s + x.score, 0) / signals.length) : 0;

    const bulls = signals.filter((s) => s.score > 0).length;
    const bears = signals.filter((s) => s.score < 0).length;
    const summary =
      `${signals.length} of ${EARNINGS_MOVE_UNIVERSE.length} tracked names report in the next ${earningsExport.lookahead_days} days ` +
      `(as of ${earningsExport.as_of}). Each carries a committed pre-print lean from insider positioning and momentum — ` +
      `${bulls} leaning bullish, ${bears} bearish going in. This is positioning, not a call on which way the result lands.`;

    return { date: dateISO, breadth, signals, summary, generatedBy: "Earnings Move" };
  },
};
