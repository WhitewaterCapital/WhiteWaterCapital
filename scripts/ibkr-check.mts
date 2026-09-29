// Live IBKR connection check — pulls your Flex statement and prints a summary.
// Reads IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID from .env.local. Never prints them.
// Run: npm run ibkr:check
import { fetchFlexStatement } from "../src/lib/broker/flex";
import { buildHistory, mapPositions, mapTrades, mapFlows } from "../src/lib/broker/ibkr";

const token = process.env.IBKR_FLEX_TOKEN;
const q = process.env.IBKR_FLEX_QUERY_ID;
if (!token || !q) {
  console.error("Missing IBKR_FLEX_TOKEN or IBKR_FLEX_QUERY_ID in .env.local — see docs/IBKR_SETUP.md");
  process.exit(1);
}
const s = await fetchFlexStatement(token, q);
const h = buildHistory(s);
const pos = mapPositions(s);
const trades = mapTrades(s);
const flows = mapFlows(s);
const acct = s.accountId.replace(/.(?=.{3})/g, "•");
console.log(`✓ Connected — account ${acct}, statement ${s.fromDate} → ${s.toDate}`);
const warn = (ok: boolean, what: string, fix: string) =>
  console.log(`${ok ? "✓" : "⚠"} ${what}${ok ? "" : `  → ${fix}`}`);
warn(h.length > 0, `NAV history: ${h.length} days`, "add the 'Net Asset Value (NAV) in Base' section to the Flex query");
warn(s.openPositions.length > 0 || h.at(-1)?.cashUsd === h.at(-1)?.totalValueUsd, `Open positions: ${pos.length}`, "add the 'Open Positions' section (Summary level)");
warn(s.trades.length > 0 || trades.length === 0, `Trades: ${trades.length}`, "add the 'Trades' section (Execution level)");
console.log(`  Deposits/withdrawals found on ${flows.size} day(s)` + (flows.size ? "" : " — if money was added in this window, add the 'Cash Transactions' section"));
if (h.length) {
  const a = h[0], b = h[h.length - 1];
  console.log(`  Account value ${b.totalValueUsd.toFixed(2)} (cash ${b.cashUsd.toFixed(2)})`);
  console.log(`  Time-weighted return since ${a.date}: ${((b.unitValueUsd / a.unitValueUsd - 1) * 100).toFixed(2)}%`);
}
