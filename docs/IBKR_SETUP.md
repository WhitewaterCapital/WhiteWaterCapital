# Connecting the real IBKR account (≈10 minutes, one time)

The site reads the club's account through IBKR's **Flex Web Service**. It is
**read-only**: the token can download statements, but it can't place orders or move money.
Numbers are end-of-day (as of the last close). This works for IBKR Ireland
(interactivebrokers.ie) accounts too.

## 1. Create the Flex Query (Client Portal)

**Performance & Reports → Flex Queries → Activity Flex Query → +**

- **Query name:** `Whitewater`
- **Sections** (tick each one, then click **Select All** for its fields):
  - **Net Asset Value (NAV) in Base**: daily account value; powers the equity curve
  - **Open Positions**: Options → **Summary**
  - **Trades**: Options → **Execution**
  - **Cash Transactions**: needed so deposits and withdrawals are *not* counted as returns
  - **Account Information** (optional): lets the site read the base currency directly
- **Delivery configuration:** Format **XML**, Period **Last 365 Calendar Days**
- **General configuration:** leave the defaults (any date format works).

Save it, then write down the **Query ID** (the number shown next to the query).

## 2. Turn on the Flex Web Service token

Same page → **Flex Web Service Configuration** (gear icon) → **Enable** → generate a
token. Set its expiry as long as IBKR allows, and put a calendar reminder to renew it.

## 3. Add the settings (never paste the token into chat or commit it)

`hf/.env.local`:

```
BROKER=ibkr
IBKR_FLEX_TOKEN=<your token>
IBKR_FLEX_QUERY_ID=<your query id>
# Optional: show the aggregate track record (%, vs S&P, drawdown) on the PUBLIC
# home page. Leave off until the team (and ideally counsel) agrees.
# PUBLIC_TRACK_RECORD=on
```

Check the connection:

```
npm run ibkr:check
```

It prints the statement window, number of NAV days, positions and trades, and the
time-weighted return, plus a ⚠ with the fix for any missing section.

On **Vercel**: go to Project → Settings → Environment Variables, add the same three
variables, then **Redeploy**.

## What changes on the site

- **The Desk** (`/dashboard`): the amber "Sample data" banner goes away. You see real
  account value, cash, time-weighted return vs SPY, Sharpe, equity curve, holdings with
  P&L, and recent fills, labelled "as of close YYYY-MM-DD".
- **Currency:** amounts are shown in the account's base currency (€ for an EUR account).
  For a non-USD book, the benchmark is **SPY converted into that currency** (SPY ÷ EURUSD),
  so the comparison is what a euro investor would have earned holding the S&P.
- **Where we stand** and the **Performance** equity curve both use the real book.
- **Public home** (`/`): stays blank ("reported at launch") unless `PUBLIC_TRACK_RECORD=on`.
  Even then it shows only aggregate % figures, never money amounts, tickers or positions.
- If IBKR is unreachable or the token has expired, the Desk shows a red error box with
  IBKR's message. It never falls back to sample numbers.
- **Unfunded account:** days at €0 are skipped, so the curve starts on the first funded day.

## How performance is measured

The site uses unit accounting (`src/lib/units.ts`). Each deposit buys units at the prior
day's unit value, and a withdrawal redeems them. Return = change in unit value, so new
money coming in never looks like a gain. The math is tested in `npm run test:flex`.
