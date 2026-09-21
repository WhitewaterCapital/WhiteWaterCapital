import type { LevelsModel, TradeIdea, EntryExitPlan } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// Intra / Exitus — a LevelsModel (entry and exit). REAL LEVELS (no RNG).
//
// This is the app-side planner used by the Stress Test page. It builds a
// vol-scaled, cost-aware levels template anchored to the name's REAL last close
// and REAL volatility (from the Incepta evidence the stress route attaches):
//   • entry zone   = a volatility-sized pullback (long) / pop (short)
//   • stop         = beyond the zone by a fixed multiple of daily vol → 1R
//   • targets      = 1.5R / 3R / 5R scale-outs
//   • sizing       = risk-budget ÷ stop distance, haircut for spread & vol
// It ABSTAINS honestly when there's no real price to anchor on — never invents
// a level. (The full OU / Dickey-Fuller engine lives in the separate Python
// repo and drives the standalone /intra-exitus page; this is the levels layer
// for the per-idea stress flow.)
//
//   intrare (enter) + exitus (exit) — entry and exit, both defined up front.
// ═══════════════════════════════════════════════════════════════════════════

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const numOf = (r: unknown, k: string): number | null => {
  const v = (r as Record<string, unknown> | null | undefined)?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export const intraExitus: LevelsModel = {
  meta: {
    id: "intra-exitus",
    name: "Intra / Exitus",
    kind: "levels",
    status: "live",
    tagline: "Entry zone and exits — stop, targets, sizing, and time-stops, sized to real vol.",
    description:
      "Turns a green-lit idea into a plan anchored to the real price and volatility: where to get in, where you're wrong, where to scale out, how big, and when to walk away on time rather than price. Abstains when there's no live price to build on.",
    etymology:
      "From intrare (to enter) + exitus (a going out — the root of 'exit'). The entry-and-exit counterpart to Distresse.",
  },

  async plan(idea: TradeIdea): Promise<EntryExitPlan> {
    const bias: "long" | "short" =
      idea.instrument === "short" || idea.instrument === "put" ? "short" : "long";

    const risk = idea.evidence?.risk;
    const last = numOf(risk, "last_close");
    // Prefer EWMA (more responsive) then realized annualised vol.
    const annVol = numOf(risk, "ewma_vol") ?? numOf(risk, "realized_vol");
    const spread = numOf(risk, "spread_bps");
    const evConf = String(idea.evidence?.confidence ?? "");

    // ── Abstain honestly: no real price → no levels. ─────────────────────────
    if (last == null || last <= 0 || annVol == null || annVol <= 0) {
      return {
        ticker: idea.ticker,
        instrument: idea.instrument,
        bias: "none",
        entryZone: null,
        stop: null,
        targets: [],
        sizingPct: null,
        timeStop: "—",
        rationale:
          `No live price/volatility for ${idea.ticker} here, so there's no honest place to put an entry, ` +
          `stop or target. Run it through Incepta first (Sentimentum → Equity → Analyze), then re-plan.`,
        invalidations: [],
        generatedBy: "Intra / Exitus · abstained (no price)",
        confidence: "insufficient",
        lastClose: null,
        noSetup: true,
      };
    }

    // ── Vol-scaled levels, anchored to the REAL last close. ──────────────────
    const sigmaD = annVol / Math.sqrt(252); // daily vol (fraction)
    const unit = last * sigmaD; // one daily-vol move, in price
    const dir = bias === "long" ? -1 : 1; // entries sit against the trade

    // Entry: 1–3 daily-vol pullback (long) / pop (short) into the zone.
    const eNear = last + dir * 1.0 * unit;
    const eFar = last + dir * 3.0 * unit;
    const entryLow = round2(Math.min(eNear, eFar));
    const entryHigh = round2(Math.max(eNear, eFar));
    const entryMid = (eNear + eFar) / 2; // = last + dir*2u

    // Stop 2 daily-vol beyond the far edge → 1R = 3 daily-vol from entry mid.
    const stopRaw = eFar + dir * 2.0 * unit;
    const stop = round2(stopRaw);
    const R = Math.abs(entryMid - stopRaw); // risk per share (≈ 3·unit)

    // Targets scale out at 1.5R / 3R / 5R the other way.
    const tDir = bias === "long" ? 1 : -1;
    const targets = [1.5, 3, 5].map((m) => round2(entryMid + tDir * m * R));

    // ── Cost-aware sizing: risk 0.75% of book on the stop, haircut for cost/vol.
    const stopPct = R / entryMid; // fractional loss if stopped from the zone mid
    const spreadHair = spread == null ? 1 : spread > 120 ? 0.55 : spread > 50 ? 0.8 : 1;
    const volHair = annVol > 0.6 ? 0.6 : annVol > 0.45 ? 0.8 : 1;
    const rawSize = (0.0075 / stopPct) * 100 * spreadHair * volHair;
    const sizingPct = idea.sizePct ?? clamp(Math.round(rawSize * 10) / 10, 0.5, 6);

    // ── Confidence + time-stop scale with the evidence and the vol regime. ───
    let confidence: EntryExitPlan["confidence"] =
      evConf === "high" ? "actionable" : evConf === "medium" ? "watch" : "watch";
    if (annVol > 0.55) confidence = "watch"; // wild tape → watch, don't fire blind
    const days = Math.round(clamp(20 * (0.3 / annVol), 8, 40));

    const pctMove = (sigmaD * 100).toFixed(1);
    const stopPctStr = (stopPct * 100).toFixed(1);

    return {
      ticker: idea.ticker,
      instrument: idea.instrument,
      bias,
      entryZone: [entryLow, entryHigh],
      stop,
      targets,
      sizingPct,
      timeStop: `Exit if the first target (~1.5R) isn't tagged within ~${days} trading days — the setup should work on this vol, or it's wrong.`,
      rationale:
        `Anchored to the real last close ${last.toFixed(2)} with a daily vol of ~${pctMove}%. ` +
        `${bias === "long" ? "Buy a 1–3 day-vol pullback into" : "Fade a 1–3 day-vol pop into"} ${entryLow}–${entryHigh}; ` +
        `the stop at ${stop} sits ~${stopPctStr}% away (1R) so you're wrong on volatility, not noise. ` +
        `Targets scale out at 1.5R / 3R / 5R.`,
      invalidations: [
        `${bias === "long" ? "A close below" : "A close above"} ${stop} voids the setup (1R breached).`,
        `A gap straight through the ${entryLow}–${entryHigh} zone on a catalyst — don't chase; re-plan off the new price.`,
        `A volatility-regime jump (daily vol well above ~${pctMove}%) — halve size or stand aside.`,
      ],
      generatedBy:
        "Intra / Exitus · vol-scaled levels" +
        (idea.evidence?.source ? ` · on ${idea.evidence.source} (${idea.evidence.confidence})` : ""),
      confidence,
      lastClose: round2(last),
      riskReward: "risk 1R → scale-outs at 1.5R / 3R / 5R",
    };
  },
};
