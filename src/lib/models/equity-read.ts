// ═══════════════════════════════════════════════════════════════════════════
// equity-read — the decisive read engine.
//
// One source of truth. Takes the REAL Incepta numbers (risk / quality /
// valuation) and turns them into a decisive, evidence-grounded read:
//   • financial health (the distress core)  • valuation  • trend  • risk
//   • a single directional verdict for the book
//
// HONESTY CONTRACT (non-negotiable):
//   • Never invents a number. A null input is EXCLUDED from its sub-score and
//     recorded in `missing`, never treated as 0 or a guess.
//   • Every sub-score is a documented, deterministic function of real inputs —
//     no RNG, no hidden LLM. Same numbers in → same read out.
//   • If too little real evidence is available, `coverage` drops and the
//     verdict says so, rather than faking conviction.
//
// DECISIVENESS CONTRACT (James's standing directive):
//   • When the evidence leans, we CALL it — robust / distressed, cheap / rich,
//     go / no-go. We reserve "neutral" for genuinely balanced evidence, not as
//     a hiding place. Being decisive here means interpreting REAL evidence with
//     conviction; it never licenses inventing evidence.
// ═══════════════════════════════════════════════════════════════════════════

// Loose on purpose: both Incepta's typed reads (which carry a few string
// fields like period_end) and Distresse's TradeEvidence records satisfy this.
// The getter below only ever pulls finite numbers, ignoring everything else.
export type Reads = unknown;

// The loose shape both Incepta's SecurityAnalysis and Distresse's TradeEvidence
// satisfy — we only ever read named numeric fields, honouring null.
export interface Evidence {
  quality?: Reads;
  valuation?: Reads;
  risk?: Reads;
}

const g = (r: Reads, k: string): number | null => {
  const v = (r as Record<string, unknown> | null | undefined)?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

// ── scoring primitives ──────────────────────────────────────────────────────
// Map a value onto 0..100 through documented breakpoints. `higherIsBetter`
// flips direction. Interpolates linearly between the two nearest stops.
type Stop = [value: number, score: number];
function scoreStops(x: number | null, stops: Stop[]): number | null {
  if (x == null) return null;
  const s = [...stops].sort((a, b) => a[0] - b[0]);
  if (x <= s[0][0]) return s[0][1];
  if (x >= s[s.length - 1][0]) return s[s.length - 1][1];
  for (let i = 0; i < s.length - 1; i++) {
    const [x0, y0] = s[i];
    const [x1, y1] = s[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return s[s.length - 1][1];
}

// A single scored line of evidence — the concrete "why".
export interface Driver {
  label: string;
  value: number | null; // raw input (for the UI to format)
  fmt: "pct" | "pctSigned" | "ratio" | "int" | "bps";
  score: number | null; // 0..100 contribution, or null if input missing
  verdict: string; // decisive one-liner on this driver
  weight: number; // relative weight in its composite
}

// Weighted mean over the drivers that actually have data. Returns the score and
// the fraction of intended weight that was available (coverage).
function composite(drivers: Driver[]): { score: number | null; coverage: number } {
  let sw = 0;
  let acc = 0;
  let total = 0;
  for (const d of drivers) {
    total += d.weight;
    if (d.score != null) {
      sw += d.weight;
      acc += d.weight * d.score;
    }
  }
  if (sw === 0) return { score: null, coverage: 0 };
  return { score: acc / sw, coverage: total ? sw / total : 0 };
}

// ── bands ────────────────────────────────────────────────────────────────────
export type HealthBand = "robust" | "sound" | "watch" | "distressed";
export type ValueBand = "cheap" | "fair" | "rich" | "extreme";
export type TrendBand = "strong" | "constructive" | "weak" | "broken";
export type RiskBand = "calm" | "normal" | "elevated" | "volatile";

const healthBand = (s: number): HealthBand =>
  s >= 75 ? "robust" : s >= 58 ? "sound" : s >= 40 ? "watch" : "distressed";
const valueBand = (s: number): ValueBand =>
  // s here is a CHEAPNESS score (100 = cheap, 0 = extreme)
  s >= 70 ? "cheap" : s >= 45 ? "fair" : s >= 25 ? "rich" : "extreme";
const trendBand = (s: number): TrendBand =>
  s >= 70 ? "strong" : s >= 50 ? "constructive" : s >= 30 ? "weak" : "broken";
const riskBand = (s: number): RiskBand =>
  // s here is a CALM score (100 = calm, 0 = volatile)
  s >= 70 ? "calm" : s >= 45 ? "normal" : s >= 25 ? "elevated" : "volatile";

export interface Read<B extends string> {
  score: number | null; // 0..100 on the axis named by `sense`
  band: B | null;
  coverage: number; // fraction of weight backed by real data
  drivers: Driver[];
  headline: string; // decisive plain-language conclusion
}

// ── FINANCIAL HEALTH (the distress core) ─────────────────────────────────────
// Higher = healthier / further from distress. Leans on the balance sheet and
// cash generation, with Piotroski's own 9-point financial-strength score as an
// anchor. This is the "Distresse" question: how far is this from trouble?
export function financialHealth(ev: Evidence): Read<HealthBand> {
  const q = ev.quality;
  const piotroski = g(q, "piotroski_f");
  const roa = g(q, "roa");
  const fcf = g(q, "fcf_margin");
  const netm = g(q, "net_margin");
  const lev = g(q, "leverage"); // total debt / assets — lower is safer
  const grow = g(q, "rev_growth");

  const drivers: Driver[] = [
    {
      label: "Piotroski F-score",
      value: piotroski,
      fmt: "int",
      weight: 26,
      score: scoreStops(piotroski, [[0, 0], [3, 20], [5, 45], [7, 80], [9, 100]]),
      verdict:
        piotroski == null
          ? "no fundamentals"
          : piotroski >= 7
            ? "9-point strength test: passing clean"
            : piotroski >= 5
              ? "middling on the 9-point strength test"
              : "failing most of the 9-point strength test",
    },
    {
      label: "Leverage (debt/assets)",
      value: lev,
      fmt: "ratio",
      weight: 22,
      score: scoreStops(lev, [[0.0, 100], [0.1, 92], [0.3, 68], [0.5, 40], [0.8, 12], [1.2, 0]]),
      verdict:
        lev == null
          ? "leverage not computable from filings"
          : lev <= 0.1
            ? "fortress balance sheet"
            : lev <= 0.3
              ? "comfortably financed"
              : lev <= 0.5
                ? "meaningfully levered"
                : "heavily levered — refi/rate risk",
    },
    {
      label: "FCF margin",
      value: fcf,
      fmt: "pct",
      weight: 20,
      score: scoreStops(fcf, [[-0.1, 0], [0, 25], [0.05, 50], [0.15, 82], [0.3, 100]]),
      verdict:
        fcf == null
          ? "free cash flow not available"
          : fcf < 0
            ? "burning cash — the distress lever"
            : fcf >= 0.15
              ? "gushing free cash"
              : "generating free cash, modestly",
    },
    {
      label: "ROA",
      value: roa,
      fmt: "pct",
      weight: 14,
      score: scoreStops(roa, [[-0.05, 0], [0, 30], [0.05, 60], [0.1, 82], [0.2, 100]]),
      verdict:
        roa == null
          ? "returns not available"
          : roa < 0
            ? "assets losing money"
            : roa >= 0.1
              ? "assets earning strongly"
              : "assets earning their keep",
    },
    {
      label: "Net margin",
      value: netm,
      fmt: "pct",
      weight: 10,
      score: scoreStops(netm, [[-0.1, 0], [0, 35], [0.1, 65], [0.25, 92], [0.4, 100]]),
      verdict:
        netm == null
          ? "margin not available"
          : netm < 0
            ? "unprofitable at the bottom line"
            : netm >= 0.2
              ? "fat bottom-line margin"
              : "profitable, ordinary margin",
    },
    {
      label: "Revenue growth",
      value: grow,
      fmt: "pctSigned",
      weight: 8,
      score: scoreStops(grow, [[-0.2, 0], [-0.05, 30], [0, 50], [0.1, 78], [0.3, 100]]),
      verdict:
        grow == null
          ? "growth not available"
          : grow < -0.02
            ? "shrinking top line"
            : grow >= 0.1
              ? "growing at a good clip"
              : "roughly flat top line",
    },
  ];

  const { score, coverage } = composite(drivers);
  const band = score == null ? null : healthBand(score);
  const headline = healthHeadline(band, drivers, coverage);
  return { score, band, coverage, drivers, headline };
}

function healthHeadline(band: HealthBand | null, drivers: Driver[], cov: number): string {
  if (band == null) return "No fundamentals to judge financial health.";
  const weak = drivers
    .filter((d) => d.score != null && d.score < 40)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const lead = weak[0]?.label.toLowerCase();
  const covNote = cov < 0.6 ? " (thin data — read as provisional)" : "";
  switch (band) {
    case "robust":
      return `Financially robust — no distress signal in the fundamentals${covNote}.`;
    case "sound":
      return `Balance sheet is sound${weak.length ? `, watch the ${lead}` : ""}${covNote}.`;
    case "watch":
      return `On watch — ${weak.length ? `${lead} is the soft spot` : "several metrics are middling"}${covNote}.`;
    case "distressed":
      return `Distress signal — ${weak.length ? `${lead} is flashing` : "the fundamentals are weak"}${covNote}.`;
  }
}

// ── VALUATION ─────────────────────────────────────────────────────────────────
// Score is CHEAPNESS: 100 = cheap, 0 = priced for perfection. Yields do the
// work (they invert richness cleanly and handle no-earnings via null).
export function valuationRead(ev: Evidence): Read<ValueBand> {
  const v = ev.valuation;
  const ey = g(v, "earnings_yield");
  const fcfy = g(v, "fcf_yield");
  const evs = g(v, "ev_sales");
  const pb = g(v, "pb");

  const drivers: Driver[] = [
    {
      label: "Earnings yield (E/P)",
      value: ey,
      fmt: "pct",
      weight: 34,
      score: scoreStops(ey, [[0.0, 5], [0.03, 25], [0.05, 50], [0.08, 78], [0.12, 100]]),
      verdict:
        ey == null
          ? "no meaningful earnings"
          : ey >= 0.08
            ? "cheap on earnings"
            : ey >= 0.05
              ? "fair on earnings"
              : ey >= 0.03
                ? "rich on earnings"
                : "priced for perfection on earnings",
    },
    {
      label: "FCF yield",
      value: fcfy,
      fmt: "pct",
      weight: 30,
      score: scoreStops(fcfy, [[-0.02, 0], [0.02, 30], [0.04, 55], [0.07, 82], [0.1, 100]]),
      verdict:
        fcfy == null
          ? "no free-cash yield"
          : fcfy >= 0.06
            ? "strong cash yield to the buyer"
            : fcfy >= 0.03
              ? "modest cash yield"
              : "thin cash yield for the price",
    },
    {
      label: "EV / Sales",
      value: evs,
      fmt: "ratio",
      weight: 22,
      score: scoreStops(evs, [[0.5, 100], [2, 78], [5, 50], [10, 25], [16, 5]]),
      verdict:
        evs == null
          ? "no EV/Sales"
          : evs <= 2
            ? "undemanding on sales"
            : evs <= 6
              ? "full on sales"
              : "expensive on sales — growth had better show",
    },
    {
      label: "Price / Book",
      value: pb,
      fmt: "ratio",
      weight: 14,
      score: scoreStops(pb, [[0.8, 100], [2, 75], [5, 50], [12, 22], [30, 5]]),
      verdict:
        pb == null
          ? "no book value"
          : pb <= 3
            ? "reasonable to book"
            : "well above book (asset-light or richly valued)",
    },
  ];

  const { score, coverage } = composite(drivers);
  const band = score == null ? null : valueBand(score);
  let headline = "Valuation can't be judged — no usable multiples.";
  if (band === "cheap") headline = "Cheap — the price is doing you a favour.";
  else if (band === "fair") headline = "Fairly priced — valuation isn't the edge here.";
  else if (band === "rich") headline = "Rich — you're paying up; the growth has to deliver.";
  else if (band === "extreme") headline = "Priced for perfection — no margin for a miss.";
  return { score, band, coverage, drivers, headline };
}

// ── TREND ─────────────────────────────────────────────────────────────────────
// Score is trend HEALTH: 100 = strong uptrend near highs, 0 = broken.
export function trendRead(ev: Evidence): Read<TrendBand> {
  const r = ev.risk;
  const mom = g(r, "mom_12_1");
  const hi = g(r, "high_52w_ratio");
  const dd = g(r, "max_dd_1y"); // negative
  const r1 = g(r, "ret_1m");

  const drivers: Driver[] = [
    {
      label: "12–1 momentum",
      value: mom,
      fmt: "pctSigned",
      weight: 38,
      score: scoreStops(mom, [[-0.4, 0], [-0.1, 30], [0, 50], [0.2, 74], [0.5, 100]]),
      verdict:
        mom == null
          ? "no price history"
          : mom >= 0.2
            ? "strong 12-month momentum"
            : mom >= 0
              ? "positive but unremarkable momentum"
              : "negative momentum — the tape disagrees",
    },
    {
      label: "Distance to 52w high",
      value: hi,
      fmt: "ratio",
      weight: 30,
      score: scoreStops(hi, [[0.5, 10], [0.75, 40], [0.9, 72], [1.0, 100]]),
      verdict:
        hi == null
          ? "no 52w range"
          : hi >= 0.9
            ? "pressing the highs"
            : hi >= 0.75
              ? "mid-range"
              : "well off the highs",
    },
    {
      label: "Max drawdown (1y)",
      value: dd,
      fmt: "pctSigned",
      weight: 20,
      score: scoreStops(dd, [[-0.5, 0], [-0.35, 25], [-0.2, 55], [-0.1, 82], [-0.03, 100]]),
      verdict:
        dd == null
          ? "no drawdown history"
          : dd <= -0.35
            ? "has been cut in a third or more"
            : dd <= -0.2
              ? "a real drawdown in the last year"
              : "shallow drawdowns — orderly",
    },
    {
      label: "1-month return",
      value: r1,
      fmt: "pctSigned",
      weight: 12,
      score: scoreStops(r1, [[-0.15, 10], [-0.05, 40], [0, 55], [0.05, 72], [0.15, 100]]),
      verdict:
        r1 == null
          ? "no recent return"
          : r1 >= 0.05
            ? "firm into the read"
            : r1 <= -0.05
              ? "soft into the read"
              : "flat into the read",
    },
  ];

  const { score, coverage } = composite(drivers);
  const band = score == null ? null : trendBand(score);
  let headline = "No price history — can't read the trend.";
  if (band === "strong") headline = "Trend is strong — buyers are in control.";
  else if (band === "constructive") headline = "Trend is constructive — the tape is with you.";
  else if (band === "weak") headline = "Trend is weak — momentum isn't confirming.";
  else if (band === "broken") headline = "Trend is broken — you'd be catching a falling knife.";
  return { score, band, coverage, drivers, headline };
}

// ── RISK / VOLATILITY ─────────────────────────────────────────────────────────
// Score is CALM: 100 = low vol / liquid / low beta, 0 = wild. Context for sizing.
export function riskRead(ev: Evidence): Read<RiskBand> {
  const r = ev.risk;
  const rv = g(r, "realized_vol");
  const dv = g(r, "downside_vol");
  const idio = g(r, "idio_vol");
  const beta = g(r, "beta_mkt");
  const spread = g(r, "spread_bps");

  const drivers: Driver[] = [
    {
      label: "Realized vol (ann.)",
      value: rv,
      fmt: "pct",
      weight: 30,
      score: scoreStops(rv, [[0.12, 100], [0.2, 78], [0.3, 52], [0.45, 25], [0.7, 5]]),
      verdict:
        rv == null ? "no vol" : rv <= 0.2 ? "low volatility" : rv <= 0.35 ? "average volatility" : "high volatility",
    },
    {
      label: "Downside vol",
      value: dv,
      fmt: "pct",
      weight: 24,
      score: scoreStops(dv, [[0.1, 100], [0.18, 76], [0.28, 50], [0.4, 22], [0.6, 5]]),
      verdict: dv == null ? "no downside vol" : dv <= 0.18 ? "contained downside" : dv <= 0.3 ? "ordinary downside" : "sharp downside",
    },
    {
      label: "Idiosyncratic vol",
      value: idio,
      fmt: "pct",
      weight: 22,
      score: scoreStops(idio, [[0.08, 100], [0.15, 76], [0.25, 50], [0.4, 20], [0.6, 5]]),
      verdict: idio == null ? "no idio vol" : idio <= 0.15 ? "mostly moves with the market" : "big single-name risk",
    },
    {
      label: "Market beta",
      value: beta,
      fmt: "ratio",
      weight: 14,
      score: scoreStops(beta, [[0.4, 100], [0.8, 80], [1.1, 55], [1.5, 28], [2.2, 5]]),
      verdict: beta == null ? "no beta" : beta <= 0.8 ? "defensive beta" : beta <= 1.2 ? "market-like beta" : "high beta — amplifies the index",
    },
    {
      label: "Est. spread",
      value: spread,
      fmt: "bps",
      weight: 10,
      score: scoreStops(spread, [[5, 100], [20, 80], [50, 55], [120, 25], [300, 5]]),
      verdict: spread == null ? "no spread est." : spread <= 25 ? "tight, liquid" : spread <= 80 ? "tradeable" : "wide — costs to get in/out",
    },
  ];

  const { score, coverage } = composite(drivers);
  const band = score == null ? null : riskBand(score);
  let headline = "No price history — can't gauge volatility.";
  if (band === "calm") headline = "Low-volatility profile — sizes up cleanly.";
  else if (band === "normal") headline = "Ordinary volatility — size it normally.";
  else if (band === "elevated") headline = "Elevated volatility — size down.";
  else if (band === "volatile") headline = "Wild — small size or leave it.";
  return { score, band, coverage, drivers, headline };
}

// ── THE VERDICT — one decisive directional call ───────────────────────────────
export type Stance = "attractive" | "constructive" | "neutral" | "cautious" | "avoid";

export interface Verdict {
  stance: Stance;
  conviction: number; // 0..100
  call: string; // the one-line, decisive read for the book
  reasons: string[]; // the 2–3 real numbers driving the call
  coverage: number; // overall data coverage
  health: Read<HealthBand>;
  valuation: Read<ValueBand>;
  trend: Read<TrendBand>;
  risk: Read<RiskBand>;
}

// ── Conviction — one honest curve, shared by the equity read and Distresse ───
// A CLEAR setup (the axes agree, so the blended read sits far from the 50 fence)
// backed by real data and not a lottery ticket should read 70+. An ambiguous
// one (blend near 50) stays low. The dampeners are truthful, not padding:
//   • coverage — thin data can't buy high conviction, only a modest floor.
//   • volatility — a strong read on a wild name is still a weaker bet.
// `leanScore` is 0..100 on whichever side's axis (long-quality, or short-fit).
export function convictionScore(
  leanScore: number,
  coverage: number,
  riskScore: number | null,
): number {
  // /35 (not /50) so a genuinely clear lean saturates the strength term: a
  // blended read of ~85/15 counts as a full-strength setup, ~72/28 as strong.
  const edge = Math.min(1, Math.abs(leanScore - 50) / 35);
  const strength = 30 + edge * 70; // edge 0 → 30, ~0.63 → ~74, 1 → 100
  const covFactor = 0.55 + 0.45 * Math.max(0, Math.min(1, coverage)); // full data → 1.0
  const volFactor = riskScore == null ? 0.92 : 0.85 + 0.15 * (riskScore / 100);
  return Math.round(Math.min(96, strength * covFactor * volFactor));
}

// Long-book perspective: quality + value + trend, with vol as a conviction
// haircut. Decisive by construction — the stance is a function of the scores.
export function equityVerdict(ev: Evidence): Verdict {
  const health = financialHealth(ev);
  const valuation = valuationRead(ev);
  const trend = trendRead(ev);
  const risk = riskRead(ev);

  // Blend on a -100..+100 conviction axis. Quality is the backbone; valuation
  // and trend push it either way; nothing here is random.
  const parts: { s: number | null; w: number }[] = [
    { s: health.score, w: 0.4 },
    { s: valuation.score, w: 0.32 },
    { s: trend.score, w: 0.28 },
  ];
  let sw = 0;
  let acc = 0;
  for (const p of parts) if (p.s != null) { sw += p.w; acc += p.w * p.s; }
  const blended = sw ? acc / sw : null; // 0..100
  const coverage =
    ([health, valuation, trend].reduce((a, r) => a + r.coverage, 0) / 3) *
    (sw / (0.4 + 0.32 + 0.28));

  if (blended == null) {
    return {
      stance: "neutral",
      conviction: 0,
      call: "Not enough real evidence to take a side on this name.",
      reasons: [],
      coverage: 0,
      health,
      valuation,
      trend,
      risk,
    };
  }

  let stance: Stance =
    blended >= 70 ? "attractive" : blended >= 57 ? "constructive" : blended >= 43 ? "neutral" : blended >= 30 ? "cautious" : "avoid";

  // Health gate — a distressed balance sheet caps a LONG stance. Cheap-and-
  // distressed is a value trap, not a buy; say so rather than let low multiples
  // mask the risk. (This is decisiveness about real weakness, not hedging.)
  if (health.band === "distressed" && (stance === "attractive" || stance === "constructive" || stance === "neutral")) {
    stance = "cautious";
  }

  // Conviction: how clearly the read leans, backed by real data, minus a vol haircut.
  const conviction = convictionScore(blended, coverage, risk.score);

  const reasons: string[] = [];
  // Lead with the strongest signals in either direction.
  const rank = [
    { r: health, tag: "health" },
    { r: valuation, tag: "valuation" },
    { r: trend, tag: "trend" },
  ]
    .filter((x) => x.r.score != null)
    .sort((a, b) => Math.abs((b.r.score ?? 50) - 50) - Math.abs((a.r.score ?? 50) - 50));
  for (const { r } of rank.slice(0, 3)) {
    const top = [...r.drivers].filter((d) => d.score != null).sort((a, b) => Math.abs((b.score ?? 50) - 50) - Math.abs((a.score ?? 50) - 50))[0];
    if (top) reasons.push(`${top.verdict}`);
  }

  const call = verdictCall(stance, health, valuation, trend);
  return { stance, conviction, call, reasons, coverage, health, valuation, trend, risk };
}

function verdictCall(stance: Stance, h: Read<HealthBand>, v: Read<ValueBand>, t: Read<TrendBand>): string {
  const q = h.band ?? "mixed";
  const val = v.band ?? "fair";
  const tr = t.band ?? "mixed";
  const rich = val === "rich" || val === "extreme";
  const cheap = val === "cheap" || val === "fair";
  // Article-free phrasing ("rich on valuation") so bands never produce "a extreme".
  switch (stance) {
    case "attractive":
      return `Own it. ${cap(q)} balance sheet, ${val} on valuation and a ${tr} tape all line up on your side — a real position.`;
    case "constructive":
      if (rich)
        return `Constructive on the business, not at this price — ${q} fundamentals but ${val} on valuation. Own it on a pullback, or accept you're paying up for quality.`;
      return `Constructive — ${q} fundamentals, ${val} on valuation and a ${tr} tape. A real long, sized with room to add.`;
    case "neutral":
      return `Balanced — ${q} quality against ${val} pricing and a ${tr} trend. No clear edge; pass unless you have a catalyst the numbers can't see.`;
    case "cautious":
      if (q === "distressed" && cheap)
        return `Cautious — it screens ${val}, but the balance sheet is distressed. That's a value trap until the fundamentals turn; if you're long, keep it small and set a hard stop.`;
      if (q === "distressed")
        return `Cautious — distressed fundamentals and ${val} on valuation. This is a special-situation bet, not an investment; small size, defined risk.`;
      return `Cautious — ${q} fundamentals or a ${tr} trend are working against you. Keep it small and define the out.`;
    case "avoid":
      return `Avoid, or a short candidate. ${cap(q)} fundamentals, ${val} on valuation and a ${tr} tape all point the same way — down.`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
