// ───────────────────────────────────────────────────────────────────────────
// Glossary — plain-language definitions + "why it matters" for every metric the
// readers surface. Shared by the Equity, Macro and Stress-test UIs so the same
// term always reads the same way. Keep entries short: a definition sentence and
// a why-it-matters sentence.
// ───────────────────────────────────────────────────────────────────────────

export type GlossEntry = { def: string; why: string };

export const GLOSSARY: Record<string, GlossEntry> = {
  // ── Equity · risk ──────────────────────────────────────────────────────────
  "12–1 momentum": {
    def: "Total return over the last 12 months, skipping the most recent month.",
    why: "The single most robust price factor — winners tend to keep winning over 3–12 months. Skipping the last month avoids short-term reversal noise.",
  },
  "1-month return": {
    def: "Price return over the most recent month.",
    why: "A read on very recent momentum — whether the name is firm or soft going into the decision.",
  },
  "Realized vol (ann.)": {
    def: "Annualised standard deviation of daily returns over the last year.",
    why: "How much the price actually moves. Higher vol means a wider range of outcomes for the same thesis — you must size smaller.",
  },
  "Downside vol": {
    def: "Volatility computed only from down days (semi-deviation).",
    why: "Separates painful downside from harmless upside swings. It's the risk you actually care about when long.",
  },
  "Max drawdown (1y)": {
    def: "The largest peak-to-trough fall in the last year.",
    why: "The real-world pain test: could you have held through it? A deep drawdown warns the name can gap through a stop.",
  },
  "Distance to 52w high": {
    def: "Last price divided by the highest price of the past year (1.0 = at the high).",
    why: "Position within the yearly range. Near 1.0 means an intact uptrend; well below means the name is out of favour.",
  },
  "Market beta": {
    def: "Sensitivity of the stock's returns to the market's, from a factor regression.",
    why: "How much a broad market move drags the name. Beta > 1 amplifies the index both ways; < 1 is defensive.",
  },
  "Idiosyncratic vol": {
    def: "The share of volatility left after removing market and factor moves.",
    why: "The name's own risk, unrelated to the market. High idio vol means the outcome hinges on this company specifically.",
  },
  "Est. spread": {
    def: "Estimated bid–ask spread in basis points.",
    why: "The cost to get in and out. Wide spreads eat returns and blow out exactly when you need to exit.",
  },
  // ── Equity · quality ────────────────────────────────────────────────────────
  ROA: {
    def: "Net income divided by total assets.",
    why: "How productively the business turns its asset base into profit — a clean, capital-structure-neutral quality read.",
  },
  ROE: {
    def: "Net income divided by shareholder equity.",
    why: "Return to owners, but distorted by buybacks and leverage — read it alongside ROA, not instead of it.",
  },
  "Gross margin": {
    def: "Gross profit as a share of revenue.",
    why: "Pricing power and unit economics. Durable high gross margins are the hallmark of a franchise.",
  },
  "Net margin": {
    def: "Bottom-line profit as a share of revenue.",
    why: "What actually drops through after everything. A thick, stable net margin is a cushion in a downturn.",
  },
  "FCF margin": {
    def: "Free cash flow as a share of revenue.",
    why: "Cash is harder to fake than earnings. Negative FCF is the classic early distress signal.",
  },
  "Leverage (debt/assets)": {
    def: "Total debt divided by total assets.",
    why: "The distress lever. High leverage means rate rises and refinancing hit the equity holder first.",
  },
  "Revenue growth": {
    def: "Year-over-year change in revenue.",
    why: "Is the business expanding or shrinking? A falling top line turns fixed costs into a problem fast.",
  },
  "Piotroski F-score": {
    def: "A 9-point checklist of profitability, leverage and efficiency signals (0 = weak, 9 = strong).",
    why: "A battle-tested, all-in-one financial-strength score. High F-scores have historically outperformed low ones.",
  },
  // ── Equity · valuation ──────────────────────────────────────────────────────
  "Market cap": {
    def: "Share price times shares outstanding — the equity's market value.",
    why: "The size of the bet the market is making, and a rough gauge of liquidity and index membership.",
  },
  "P/E": {
    def: "Price divided by earnings per share.",
    why: "What you pay for a dollar of current earnings. High P/E prices in a lot of future growth.",
  },
  "Earnings yield (E/P)": {
    def: "Earnings divided by price — the inverse of P/E.",
    why: "The earnings return the price is offering you, directly comparable to a bond yield. Higher = cheaper.",
  },
  "P/B": {
    def: "Price divided by book value per share.",
    why: "Price versus accounting net worth. Very high P/B is either an asset-light franchise or an expensive stock.",
  },
  "P/S": {
    def: "Price divided by sales per share.",
    why: "Useful when earnings are thin or negative. High P/S needs high future margins to justify it.",
  },
  "FCF yield": {
    def: "Free cash flow divided by market value.",
    why: "The cash return to owners at today's price — the most honest 'what am I really getting' yield.",
  },
  "EV / Sales": {
    def: "Enterprise value (equity + net debt) divided by revenue.",
    why: "A capital-structure-neutral valuation. Rich EV/Sales means the market expects strong future profitability.",
  },
  // ── Macro · steady state ────────────────────────────────────────────────────
  "Capital / output": {
    def: "The economy's capital stock relative to annual output, at the model's resting point.",
    why: "Sets how capital-intensive the modelled economy is — the baseline the shocks are measured against.",
  },
  "Housing / output": {
    def: "The value of the housing stock relative to output.",
    why: "How large housing is in this economy — bigger means housing shocks matter more for everything else.",
  },
  "Hours worked": {
    def: "The steady-state share of time spent working.",
    why: "The labour-supply anchor. Shocks move hours around this level.",
  },
  "Mortgage burden (of income)": {
    def: "Mortgage payment as a share of worker income at steady state.",
    why: "How stretched households are before any shock. A high burden means rate moves hit consumption harder.",
  },
  "Implied mortgage rate": {
    def: "The annual mortgage rate the model calibrates to.",
    why: "The cost of housing credit in the model — the channel monetary shocks travel through.",
  },
  "Amortisation rate": {
    def: "The pace at which mortgage principal is paid down.",
    why: "Sets how quickly households build equity and how sensitive they are to refinancing.",
  },
  // ── Macro · scenarios ───────────────────────────────────────────────────────
  "On impact": {
    def: "The response in the first quarter after the shock — this sets the direction.",
    why: "Tells you which way each variable moves right away, before dynamics play out.",
  },
  Peak: {
    def: "The largest-magnitude response over the horizon, and the quarter it occurs.",
    why: "The size and timing of the biggest effect — how much it ultimately matters, and when to expect it.",
  },
  "mean-reverts": {
    def: "The response flips sign over the horizon and heads back toward normal.",
    why: "A shock whose effect reverses is transitory, not permanent — you fade it rather than chase it.",
  },
  "% deviation": {
    def: "Percentage deviation of a variable from its steady-state level.",
    why: "Every path is normalised to a +1% shock, so responses scale linearly — double the shock, double the path.",
  },
};

export function gloss(term: string): GlossEntry | undefined {
  return GLOSSARY[term];
}
