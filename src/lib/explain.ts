// ───────────────────────────────────────────────────────────────────────────
// Plain-language layer for the desk's model pages.
//
// Same shape and spirit as src/lib/glossary.ts: every term a page surfaces gets
// a one-sentence definition and a one-sentence "why it matters", written for a
// member who does NOT know the quant vocabulary. The <Term> component reads
// TERMS; the plain* helpers turn a raw number into a human phrase so the
// biggest text on a card is a sentence, not a code.
// ───────────────────────────────────────────────────────────────────────────

export type Explained = { def: string; why: string };

export const TERMS: Record<string, Explained> = {
  decile: {
    def: "A 1-to-10 ranking of where a stock sits versus every other name the model looked at this week (10 = most preferred, 1 = least).",
    why: "It's a ranking, not a promise of a return — it tells you where a name stands in the pack, so the top and bottom are where to look first.",
  },
  "expected relative return": {
    def: "A standardized strength score, not a percentage — how far above or below the pack the model rates this name.",
    why: "Use it only to order names against each other; read the actual size of the possible move off the range, never off this number.",
  },
  "quantile band": {
    def: "The model's low-to-high range of likely outcomes (10th to 90th percentile), so you see the spread, not just a single guess.",
    why: "A wide band means the model is unsure; a narrow band means it's more confident. It's an honest picture of the uncertainty.",
  },
  "z-score": {
    def: "How far a value sits from its own normal level, measured in standard deviations (0 = normal, ±2 = unusually far).",
    why: "It flags when a spread or signal is stretched far enough from normal to be worth acting on, rather than everyday wiggle.",
  },
  cointegration: {
    def: "Two stocks whose prices tend to move together and drift back toward a stable relationship over time.",
    why: "When such a pair pulls unusually far apart, betting on it snapping back is the core pairs-trade idea — that's what this screen looks for.",
  },
  "half-life": {
    def: "Roughly how long it typically takes a stretched spread to close halfway back to normal.",
    why: "It sets your patience: a short half-life means the trade should resolve quickly; a long one means you'd be holding a while.",
  },
  "momentum beta": {
    def: "How strongly a name rides the market's overall momentum factor.",
    why: "A high reading means the stock tends to amplify momentum moves — useful for knowing whether it leads or lags a trend.",
  },
  "insider posture": {
    def: "Whether company insiders (executives, directors) have been net buyers or net sellers of their own stock recently.",
    why: "Insiders buying with their own money is one of the few signals grounded in people who know the business best.",
  },
  sue: {
    def: "Earnings surprise measured in standard deviations from what analysts expected (Standardized Unexpected Earnings).",
    why: "It turns 'beat or missed' into a comparable number, so a big surprise stands out from a rounding-error beat.",
  },
  lean: {
    def: "The model's mild directional tilt into an event — a soft nudge, not a forecast of which way the stock will move.",
    why: "It's deliberately weak language: the desk still decides. 'No lean' means nothing here is pointing you either way.",
  },
  attribution: {
    def: "Splitting the account's total return into how much each strategy (or sleeve) actually contributed.",
    why: "It answers 'what's actually making or losing us money', instead of one blended number that hides the drivers.",
  },
  sharpe: {
    def: "Return earned for each unit of risk taken (higher is better; above ~1 is generally considered good).",
    why: "It rewards steady gains over lucky-but-wild ones, so two strategies with the same return aren't treated as equal.",
  },
  drawdown: {
    def: "The largest drop from a peak to a later low — the worst stretch you'd have had to sit through.",
    why: "It's the real-world pain test: could the team have held through it without bailing at the bottom?",
  },
  "synthetic-demo": {
    def: "Illustrative made-up data, clearly labeled, used to show the page working before the real market feed is connected.",
    why: "Nothing here is a real pick yet — it's a preview of the machinery, never a number to trade on.",
  },
  "research read": {
    def: "A starting point for discussion, not a recommendation or an order.",
    why: "The desk still runs its own adversarial check (Stress Test) and votes before any real money moves.",
  },
};

// ── number → human phrase ────────────────────────────────────────────────────

/** Plain-language reading of a WW-Weekly 1..10 decile. */
export function plainDecile(d: number | null | undefined): string {
  if (d == null) return "Not ranked this week.";
  if (d >= 8) return "Near the top of the model's ranking this week — a name to look at first.";
  if (d <= 3) return "Near the bottom of the ranking this week — one to be cautious on.";
  return "Middle of the pack — the model has no strong lean either way.";
}

/** One-word bull/bear/neutral label from a signed score. */
export function directionWord(score: number | null | undefined): "Positive" | "Negative" | "Neutral" {
  if (score == null || Math.abs(score) < 1e-9) return "Neutral";
  return score > 0 ? "Positive" : "Negative";
}

/** Plain reading of a spread z-score (how stretched a pair is). */
export function plainZ(z: number | null | undefined): string {
  if (z == null) return "No spread reading available.";
  const a = Math.abs(z);
  if (a >= 2) return "The pair is stretched unusually far apart — the setup this screen is built to catch.";
  if (a >= 1) return "The pair is moderately stretched — worth watching, not yet extreme.";
  return "The pair is close to its normal relationship — nothing to act on.";
}
