import type { LevelsModel, TradeIdea, EntryExitPlan } from "../types";
import { planStatus, expectancyHorizon } from "@/lib/plan-status";

// ═══════════════════════════════════════════════════════════════════════════
// Intra / Exitus — a LevelsModel (entry and exit). REAL LEVELS (no RNG).
//
// This is the app-side planner used by the Stress Test page. It builds a
// vol-scaled, cost-aware levels template anchored to the name's REAL last close
// and REAL volatility (from the Incepta evidence the stress route attaches):
//   • entry zone   = a volatility-sized pullback (long) / pop (short)
//   • stop         = beyond the zone by a fixed multiple of daily vol → 1R
//   • targets      = 1.5R / 3R / 5R scale-outs
//   • sizing       = risk-budget (1% of book, same as the Python engine's
//                    SizeConfig) ÷ stop distance, haircut for spread & vol
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
    // Anchor on the LIVE price when we have it (levels built off yesterday's
    // close were off by the day's move — fix 2026-10).
    const anchor = idea.evidence?.livePrice && idea.evidence.livePrice > 0 ? idea.evidence.livePrice : last;
    const unit = anchor * sigmaD; // one daily-vol move, in price
    const dir = bias === "long" ? -1 : 1; // entries sit against the trade

    // Entry: from today's price to a 2-daily-vol dip (long) / pop (short) —
    // "buy now or on a dip". (Fix 2026-10: the zone used to start 1 daily-vol
    // AWAY from the price, so it could never be actionable at the market.)
    const eNear = anchor;
    const eFar = anchor + dir * 2.0 * unit;
    const entryLow = round2(Math.min(eNear, eFar));
    const entryHigh = round2(Math.max(eNear, eFar));
    const entryMid = (eNear + eFar) / 2; // = last + dir*1u

    // Stop 2 daily-vol beyond the far edge → 1R = 3 daily-vol from entry mid.
    const stopRaw = eFar + dir * 2.0 * unit;
    const stop = round2(stopRaw);
    const R = Math.abs(entryMid - stopRaw); // risk per share (≈ 3·unit)

    // Time stop (trading days): faster for wild names, slower for calm ones.
    const days = Math.round(clamp(20 * (0.3 / annVol), 8, 40));
    // Targets at 1.5R / 2.5R / 4R — but only those reachable inside the time
    // stop: ≤ 2σ of the horizon move (fix 2026-10: the old 5R target was ~15
    // daily σ away, a fantasy over a few weeks).
    const tDir = bias === "long" ? 1 : -1;
    const reach = 2 * unit * Math.sqrt(days);
    let targets = [1.5, 2.5, 4]
      .map((m) => round2(entryMid + tDir * m * R))
      .filter((t) => t > 0.01 * anchor && Math.abs(t - entryMid) <= reach);
    const outOfReach = targets.length === 0;
    if (outOfReach) targets = [round2(entryMid + tDir * R)]; // 1R marker only
    // ── Cost-aware sizing: risk 1% of book on the stop (matches the engine),
    //    haircut for cost/vol.
    const stopPct = R / entryMid; // fractional loss if stopped from the zone mid
    const spreadHair = spread == null ? 1 : spread > 120 ? 0.55 : spread > 50 ? 0.8 : 1;
    const volHair = annVol > 0.6 ? 0.6 : annVol > 0.45 ? 0.8 : 1;
    const rawSize = (0.01 / stopPct) * 100 * spreadHair * volHair;
    const sizingPct = idea.sizePct ?? clamp(Math.round(rawSize * 10) / 10, 0.5, 6);

    // ── Expected R within the time stop (no unlimited-time optimism). Drift:
    //    a quarter of the 12-1 momentum persists, signed toward the trade.
    const mom = numOf(risk, "mom_12_1") ?? 0;
    const driftPx = 0.25 * (mom / 252) * anchor * (bias === "long" ? 1 : -1);
    const expR = expectancyHorizon(Math.abs(targets[0] - entryMid), R, driftPx, unit, days);

    // ── Status vs the LIVE price, then confidence. A plan is only actionable
    //    if the price is actually in (or better than) the entry zone today.
    const live = anchor;
    const status = planStatus(bias, [entryLow, entryHigh], stop, targets, live);
    let confidence: EntryExitPlan["confidence"] =
      status.actionable && evConf !== "low" && !outOfReach && (expR ?? 0) > 0 ? "actionable" : "watch";
    if (annVol > 0.55) confidence = "watch"; // wild tape → watch, don't fire blind

    const pctMove = (sigmaD * 100).toFixed(1);
    // Staleness: levels anchor to the evidence's last close. If that's more
    // than a week old, say so (and don't call it actionable).
    const asOf = idea.evidence?.asOf;
    const ageDays = asOf ? Math.floor((Date.now() - new Date(asOf).getTime()) / 86400_000) : null;
    const stale = ageDays != null && ageDays > 7;
    if (stale) confidence = "watch";
    const staleNote = stale
      ? ` ⚠ The anchor price is ${ageDays} days old (as of ${asOf}) — re-run the engine before acting.`
      : "";
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
        `Anchored to ${anchor === last ? `the last close ${last.toFixed(2)}` : `the live price ${anchor.toFixed(2)}`} with a daily vol of ~${pctMove}%. ` +
        `${bias === "long" ? "Buy at the market or on a dip of up to 2 daily moves" : "Short at the market or into a pop of up to 2 daily moves"}: ${entryLow}–${entryHigh}; ` +
        `the stop at ${stop} sits ~${stopPctStr}% away (1R) so you're wrong on volatility, not noise. ` +
        `Targets at 1.5R / 2.5R / 4R, kept only within a realistic ${days}-day move (±${((reach / entryMid) * 100).toFixed(0)}%)` +
        `${expR != null ? `; expected ${expR >= 0 ? "+" : ""}${expR.toFixed(2)}R within the time stop` : ""}. ` +
        status.detail +
        (outOfReach ? " The stop is too wide for this volatility to reach even 1.5R in time — watch only." : "") +
        staleNote,
      invalidations: [
        `${bias === "long" ? "A close below" : "A close above"} ${stop} voids the setup (1R breached).`,
        `A gap straight through the ${entryLow}–${entryHigh} zone on a catalyst — don't chase; re-plan off the new price.`,
        `A volatility-regime jump (daily vol well above ~${pctMove}%) — halve size or stand aside.`,
      ],
      generatedBy:
        "Intra / Exitus · vol-scaled levels" +
        (idea.evidence?.source ? ` · on ${idea.evidence.source} (${idea.evidence.confidence})` : ""),
      confidence,
      lastClose: round2(anchor),
      riskReward: `risk 1R → ${targets.length} target${targets.length === 1 ? "" : "s"}${expR != null ? ` · E[R] ${expR >= 0 ? "+" : ""}${expR.toFixed(2)}` : ""}`,
      status: status.state,
      statusLabel: status.label,
    };
  },
};
