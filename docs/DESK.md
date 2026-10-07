# The Desk: search any stock

`/dashboard` is one search bar. Type a ticker or company name, and `/t/<TICKER>` runs every model on it
**live**, for any listed stock, on Vercel too. Nothing is pre-computed.

## What runs (src/lib/live/)

| Piece | Source (free, keyless) | File |
|---|---|---|
| Prices, quote, search, ticker headlines | Yahoo Finance | `yahoo.ts` |
| Fundamentals (10-K/10-Q, 20-F IFRS), TTM, Piotroski | SEC EDGAR XBRL | `sec.ts` |
| Market cap, sector/industry, Street target | Nasdaq quote API | `nasdaq.ts` |
| Next earnings, consensus EPS, estimate revisions | Nasdaq / Zacks | `nasdaq.ts` |
| Insider buying/selling (Form 4) | SEC EDGAR | `form4.ts` |
| Momentum, vol, drawdown, beta, spread | computed from prices | `risk.ts` |
| Relative value vs sector ETF (Engle-Granger) | computed from prices | `relvalue.ts` |
| News: the company, its industry, macro | Yahoo, Google News, GDELT | `news.ts` |

## The models and how they vote (`desk.ts`)

Fundamentals 32% · Momentum & insiders 20% · Analysts & earnings 20% · Macro fit 16% · Relative value 12%.
The Stress Test re-reads the same fundamentals from the other side, so it's shown but doesn't vote. Weekly
ranking is shown for names in its universe; its tested skill is weak, so it doesn't vote either.
Conviction = how far the vote leans × how much the models agree × how much data there is.

## Push back (`challenge.ts`)

A member's point gets classified (bull/bear, topic → model), fact-checked against the numbers, researched
in 30 days of news, and the desk vote is re-run as if it's right. It's free by default. Set
`CHALLENGE_ENGINE=claude` plus `ANTHROPIC_API_KEY` to have Claude write the reply from the same facts.

## Check a ticker from the terminal

```
npm run desk -- NVDA KO PLTR
```
