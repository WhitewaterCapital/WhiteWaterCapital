import type {
  EvaluatorModel,
  TradeIdea,
  StressVerdict,
  Rating,
  Dimension,
  EvidenceGroup,
  EvidenceRow,
} from "../types";
import {
  equityVerdict,
  financialHealth,
  valuationRead,
  trendRead,
  riskRead,
  convictionScore,
  type Read,
  type Driver,
} from "../equity-read";

// ═══════════════════════════════════════════════════════════════════════════
// Distresse — the adversarial stress test. REAL MODEL (no RNG, no LLM).
//
// It sits on top of the Incepta equity engine: the engine is the evidence
// (real SEC filings + prices), Distresse is the judge. It scores the name's
// financial health (the distress core), valuation, trend and volatility from
// those real numbers, then makes a blunt, direction-aware call:
//   • long / call  → is this a name worth owning?
//   • short / put  → is this a name worth being short?
// Same numbers in → same verdict out. If there's no real evidence for the
// name in this environment, it says so rather than inventing a score.
// ═══════════════════════════════════════════════════════════════════════════

const fmtVal = (v: number | null, fmt: Driver["fmt"]): string => {
  if (v == null) return "—";
  switch (fmt) {
    case "pct":
      return `${(v * 100).toFixed(1)}%`;
    case "pctSigned":
      return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
    case "ratio":
      return v.toFixed(2);
    case "int":
      return String(Math.round(v));
    case "bps":
      return `${v.toFixed(0)} bps`;
  }
};

const rowsOf = (r: Read<string>): EvidenceRow[] =>
  r.drivers.map((d) => ({
    label: d.label,
    value: fmtVal(d.value, d.fmt),
    verdict: d.verdict,
    score: d.score == null ? null : Math.round(d.score),
  }));

const groupOf = (name: string, r: Read<string>): EvidenceGroup => ({
  group: name,
  band: r.band,
  score: r.score == null ? null : Math.round(r.score),
  coverage: r.coverage,
  headline: r.headline,
  rows: rowsOf(r),
});

export const distresse: EvaluatorModel = {
  meta: {
    id: "distresse",
    name: "Distresse",
    kind: "evaluator",
    status: "live",
    tagline: "Adversarial quant stress test on real filings — a straight go / no-go.",
    description:
      "Judges a trade on the name's real fundamentals: financial health (the distress core), valuation, trend and volatility. Plays devil's advocate against your side, then gives a blunt, direction-aware call — grounded in numbers, never invented.",
    etymology: "From Latin districtia — to be pulled apart, stretched, stressed.",
  },

  async evaluate(idea: TradeIdea): Promise<StressVerdict> {
    const ev = idea.evidence;
    const isShort = idea.instrument === "short" || idea.instrument === "put";
    const side = isShort ? "short" : "long";

    // ── No real evidence → abstain honestly. No RNG, no fabricated score. ────
    if (!ev || (!ev.quality && !ev.valuation && !ev.risk)) {
      return {
        ticker: idea.ticker,
        instrument: idea.instrument,
        rating: "conditional",
        conviction: 0,
        regime: "No evidence loaded",
        dimensions: [],
        devilsAdvocate: [
          "There's no real fundamental or price evidence for this name in this environment, so there's nothing to stress-test.",
        ],
        tailRisks: [],
        bottomLine:
          `No call — ${idea.ticker} isn't in the covered universe and live fundamentals aren't available here. ` +
          `Run it through the Incepta equity engine first (Sentimentum → Equity → Analyze), then stress-test the evidence.`,
        generatedBy: "Distresse · no evidence",
        noEvidence: true,
      };
    }

    // ── Real reads from the real numbers. ────────────────────────────────────
    const evidence = { quality: ev.quality, valuation: ev.valuation, risk: ev.risk };
    const health = financialHealth(evidence);
    const valuation = valuationRead(evidence);
    const trend = trendRead(evidence);
    const risk = riskRead(evidence);
    const longVerdict = equityVerdict(evidence);

    // Trade attractiveness for THIS side. Health/valuation/trend are facts about
    // the company; whether they help or hurt depends on which way you're leaning.
    // A distressed, expensive, broken name is a BAD long and a GOOD short.
    const B = blended(health.score, valuation.score, trend.score); // 0..100 long-quality
    const tradeScore = B == null ? null : isShort ? 100 - B : B; // 0..100 for this side
    const cov = longVerdict.coverage;

    let rating: Rating = "conditional";
    let conviction = 0;
    if (tradeScore != null) {
      // Take a side: anything off the midpoint gets a go/no-go call, with
      // conviction carrying HOW strong it is. Only a razor-thin tie (48–52)
      // stays "conditional" — and that's stated as a genuine coin-flip, not a
      // safe hedge. A weak-but-real edge is still a call, not a shrug.
      rating = tradeScore >= 52 ? "go" : tradeScore <= 48 ? "no-go" : "conditional";
      conviction = convictionScore(tradeScore, cov, risk.score);
    }

    // ── Dimension scorecard (−100 hostile .. +100 supportive to THIS trade) ──
    const dir = isShort ? -1 : 1;
    const toSigned = (s: number | null) => (s == null ? 0 : Math.round((s - 50) * 2));
    const dims: Dimension[] = [
      {
        label: "Financial health",
        score: toSigned(health.score) * dir,
        note: `${health.headline}${isShort ? " (for a short, weakness is the case FOR you)." : ""}`,
      },
      {
        label: "Valuation",
        score: toSigned(valuation.score) * dir,
        note: `${valuation.headline}${isShort ? " A cheap name is a dangerous short." : ""}`,
      },
      {
        label: "Trend / momentum",
        score: toSigned(trend.score) * dir,
        note: trend.headline,
      },
      {
        label: "Volatility / liquidity",
        score: toSigned(risk.score),
        note: risk.headline,
      },
    ];

    // ── Devil's advocate — the strongest REAL case against this trade. ───────
    const devils = devilsAdvocate(side, health, valuation, trend, risk, ev.flags);
    const tails = tailRisks(health, trend, risk);

    // ── Bottom line — blunt, direction-aware, grounded in the numbers. ───────
    const bottom = bottomLine(idea.ticker, side, rating, health, valuation, trend, tradeScore);

    const regime =
      risk.drivers.find((d) => d.label === "Market beta")?.value != null
        ? `Name-level read · β(mkt) ${fmtVal(risk.drivers.find((d) => d.label === "Market beta")!.value, "ratio")}, ` +
          `${risk.band ?? "—"} volatility profile`
        : "Name-level read on real fundamentals";

    const provenance = ev.source ? ` · on ${ev.source} (${ev.confidence})` : "";

    return {
      ticker: idea.ticker,
      instrument: idea.instrument,
      rating,
      conviction,
      regime,
      dimensions: dims,
      devilsAdvocate: devils,
      tailRisks: tails,
      bottomLine: bottom,
      generatedBy: "Distresse · real fundamentals" + provenance,
      healthScore: health.score == null ? null : Math.round(health.score),
      healthBand: health.band,
      coverage: cov,
      asOf: ev.asOf,
      evidence: [
        groupOf("Financial health", health),
        groupOf("Valuation", valuation),
        groupOf("Trend / momentum", trend),
        groupOf("Volatility / liquidity", risk),
      ],
    };
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────
function blended(h: number | null, v: number | null, t: number | null): number | null {
  const parts: [number | null, number][] = [
    [h, 0.4],
    [v, 0.32],
    [t, 0.28],
  ];
  let sw = 0;
  let acc = 0;
  for (const [s, w] of parts) if (s != null) { sw += w; acc += w * s; }
  return sw ? acc / sw : null;
}

function devilsAdvocate(
  side: "long" | "short",
  health: Read<string>,
  valuation: Read<string>,
  trend: Read<string>,
  risk: Read<string>,
  flags?: string[],
): string[] {
  const out: string[] = [];
  // For a long, the case against = weak reads. For a short, = strong reads.
  const against = (r: Read<string>, weakIfLow: boolean) => {
    if (r.score == null) return null;
    const bad = side === "long" ? (weakIfLow ? r.score < 45 : false) : weakIfLow ? r.score > 55 : false;
    return bad;
  };
  const worst = (r: Read<string>) =>
    [...r.drivers].filter((d) => d.score != null).sort((a, b) => (a.score! - b.score!))[0];
  const best = (r: Read<string>) =>
    [...r.drivers].filter((d) => d.score != null).sort((a, b) => (b.score! - a.score!))[0];

  if (side === "long") {
    if (against(health, true)) out.push(`Fundamentals are the problem: ${worst(health)?.verdict}. That's the distress lever, not a rounding error.`);
    if (valuation.score != null && valuation.score < 40) out.push(`You're paying up: ${worst(valuation)?.verdict}. All the good news is already in the price.`);
    if (trend.score != null && trend.score < 40) out.push(`The tape disagrees: ${worst(trend)?.verdict}. You'd be fighting price to be right.`);
  } else {
    if (health.score != null && health.score > 60) out.push(`Wrong name to short: ${best(health)?.verdict}. Healthy companies grind shorts higher.`);
    if (valuation.score != null && valuation.score > 60) out.push(`It's already cheap: ${best(valuation)?.verdict}. Cheap shorts get taken out.`);
    if (trend.score != null && trend.score > 60) out.push(`Momentum is against the short: ${best(trend)?.verdict}. Don't short strength without a catalyst.`);
  }
  if (risk.score != null && risk.score < 35) out.push(`Execution risk is real: ${worst(risk)?.verdict}. Size for the volatility, not the thesis.`);
  for (const f of flags ?? []) out.push(`Engine flag: ${f}.`);
  if (out.length === 0) out.push(`The obvious risks don't show in the numbers — the case against is that the read is only as fresh as the last filing.`);
  return out.slice(0, 5);
}

function tailRisks(health: Read<string>, trend: Read<string>, risk: Read<string>): string[] {
  const out: string[] = [];
  const lev = health.drivers.find((d) => d.label.startsWith("Leverage"));
  const beta = risk.drivers.find((d) => d.label === "Market beta");
  const dd = trend.drivers.find((d) => d.label.startsWith("Max drawdown"));
  const spread = risk.drivers.find((d) => d.label === "Est. spread");
  if (lev?.value != null && lev.value > 0.4) out.push(`Refinancing / rate tail — leverage at ${lev.value.toFixed(2)} debt/assets means higher-for-longer rates bite the equity first.`);
  if (beta?.value != null && beta.value > 1.3) out.push(`Market tail — a β of ${beta.value.toFixed(2)} means a broad risk-off swamps the single-name thesis.`);
  if (dd?.value != null && dd.value < -0.3) out.push(`Gap risk — this name has already fallen ${(dd.value * 100).toFixed(0)}% peak-to-trough once this year; it can do it again through your stop.`);
  if (spread?.value != null && spread.value > 100) out.push(`Liquidity air-pocket — a ~${spread.value.toFixed(0)}bp spread widens fast in stress, right when you need the exit.`);
  if (out.length === 0) out.push(`A single filing revision or guide-down can reset the whole read — the evidence is point-in-time.`);
  return out.slice(0, 4);
}

function bottomLine(
  ticker: string,
  side: "long" | "short",
  rating: Rating,
  health: Read<string>,
  valuation: Read<string>,
  trend: Read<string>,
  tradeScore: number | null,
): string {
  if (tradeScore == null) return `No call on ${ticker} — not enough real evidence to stress-test.`;
  const h = health.band ?? "mixed";
  const v = valuation.band ?? "fairly priced";
  const t = trend.band ?? "mixed";
  const sideWord = side === "short" ? "short" : "long";
  if (rating === "go")
    return `Straight up: this clears the bar as a ${sideWord}. ${cap(h)} health, ${v} valuation and a ${t} trend line up on your side. Size it and define the invalidation.`;
  if (rating === "no-go")
    return `Straight up: pass on the ${sideWord}. The numbers lean the other way — ${cap(h)} health, ${v} valuation, ${t} trend. ${side === "short" ? "You'd be shorting quality." : "Good name, wrong side or wrong price."}`;
  return `Straight up: only with conditions. As a ${sideWord} the evidence is split — ${cap(h)} health but ${v} valuation and a ${t} trend. Wait for a better price or a catalyst, or keep it a half-size probe.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
