import type { AccountState, BrokerAdapter, BrokerMeta } from "./broker";
import type { Position, Snapshot, Trade } from "../types";
import { STARTING_UNIT_VALUE } from "../units";
import {
  fetchFlexStatement,
  flexDate,
  flexDateTime,
  type FlexRow,
  type FlexStatement,
} from "./flex";

// ---------------------------------------------------------------------------
// Interactive Brokers adapter — READ-ONLY, via the Flex Web Service.
//
// Env (set in .env.local locally and in Vercel → Settings → Environment Vars):
//   BROKER=ibkr
//   IBKR_FLEX_TOKEN     the Flex Web Service token (Reporting → Flex Web Service)
//   IBKR_FLEX_QUERY_ID  the Activity Flex Query id (see docs/IBKR_SETUP.md)
//
// One Flex statement gives us everything: open positions, fills, daily NAV
// (for the equity curve) and deposits/withdrawals (for unit accounting, so
// money coming in is never counted as performance). All amounts are converted
// to the account's BASE currency (EUR for IBKR Ireland) with IBKR's own
// fxRateToBase — the `*Usd` field names are historical.
//
// Statements are cached in-process for FLEX_TTL_MS: Flex is end-of-day data
// and IBKR rate-limits the token, so there's no point hitting it per request.
// ---------------------------------------------------------------------------

const FLEX_TTL_MS = 30 * 60 * 1000;

let cache: { at: number; stmt: FlexStatement } | null = null;
let inflight: Promise<FlexStatement> | null = null;

const n = (s: string | undefined) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};
const fx = (r: FlexRow) => (r.fxRateToBase ? n(r.fxRateToBase) || 1 : 1);

// Flex repeats rows at several levels of detail (lot vs summary, execution vs
// order, per-currency vs base summary). Keep one canonical level per section.
const isSummaryPosition = (r: FlexRow) =>
  !r.levelOfDetail || r.levelOfDetail.toUpperCase() === "SUMMARY";
const isExecution = (r: FlexRow) =>
  !r.levelOfDetail || r.levelOfDetail.toUpperCase() === "EXECUTION";
const isDetailCash = (r: FlexRow) =>
  (!r.levelOfDetail || r.levelOfDetail.toUpperCase() === "DETAIL") &&
  r.currency !== "BASE_SUMMARY";
const isDepositWithdrawal = (r: FlexRow) =>
  /deposit/i.test(r.type ?? "") && /withdraw/i.test(r.type ?? "");

export function mapPositions(stmt: FlexStatement): Position[] {
  return stmt.openPositions
    .filter(isSummaryPosition)
    .filter((r) => n(r.position) !== 0)
    .map((r) => {
      const rate = fx(r);
      const qty = n(r.position);
      const mult = n(r.multiplier) || 1;
      const marketValueUsd = n(r.positionValue) * rate;
      const costBasis = r.costBasisMoney
        ? n(r.costBasisMoney) * rate
        : n(r.costBasisPrice) * qty * mult * rate;
      return {
        symbol: r.symbol || r.description || "?",
        quantity: qty,
        avgCostUsd: r.costBasisPrice ? n(r.costBasisPrice) * rate : n(r.openPrice) * rate,
        lastPriceUsd: n(r.markPrice) * rate,
        marketValueUsd,
        unrealizedPnlUsd: r.fifoPnlUnrealized
          ? n(r.fifoPnlUnrealized) * rate
          : marketValueUsd - costBasis,
        openedAt: flexDate(r.openDateTime) ?? flexDate(r.reportDate) ?? "",
      };
    })
    .sort((a, b) => b.marketValueUsd - a.marketValueUsd);
}

export function mapTrades(stmt: FlexStatement): Trade[] {
  return stmt.trades
    .filter(isExecution)
    .filter((r) => (r.assetCategory ?? "").toUpperCase() !== "CASH") // FX conversions
    .filter((r) => !/\(Ca\.\)/.test(r.buySell ?? "")) // cancelled fills
    .map((r, i) => {
      const side: "buy" | "sell" = /^SELL/i.test(r.buySell ?? "")
        ? "sell"
        : /^BUY/i.test(r.buySell ?? "")
          ? "buy"
          : n(r.quantity) < 0
            ? "sell"
            : "buy";
      return {
        id: r.tradeID || r.ibExecID || `flex-${i}`,
        symbol: r.symbol || "?",
        side,
        quantity: Math.abs(n(r.quantity)),
        priceUsd: n(r.tradePrice) * fx(r),
        executedAt: flexDateTime(r.dateTime) ?? flexDateTime(r.tradeDate) ?? "",
      };
    })
    .sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}

// Net external cash flow (deposits − withdrawals) per date, in base currency.
export function mapFlows(stmt: FlexStatement): Map<string, number> {
  const flows = new Map<string, number>();
  for (const r of stmt.cashTransactions) {
    if (!isDetailCash(r) || !isDepositWithdrawal(r)) continue;
    const d = flexDate(r.reportDate) ?? flexDate(r.dateTime) ?? flexDate(r.settleDate);
    if (!d) continue;
    flows.set(d, (flows.get(d) ?? 0) + n(r.amount) * fx(r));
  }
  return flows;
}

// Daily NAV → unit-value history. Units are issued/redeemed at the previous
// day's unit value whenever money moves in or out, so deposits never show up
// as returns (see src/lib/units.ts for the concept). SPY is filled in later
// by the book loader; here it's NaN.
export function buildHistory(stmt: FlexStatement): Snapshot[] {
  const flows = mapFlows(stmt);
  const days = stmt.equitySummary
    .map((r) => ({
      date: flexDate(r.reportDate) ?? "",
      total: n(r.total),
      cash: n(r.cash),
    }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Flows dated on non-NAV days (weekends/holidays) roll into the next NAV day.
  const flowDates = [...flows.keys()].sort();
  let fi = 0;

  const out: Snapshot[] = [];
  let units = 0;
  let uv = STARTING_UNIT_VALUE;
  for (const d of days) {
    let flow = 0;
    while (fi < flowDates.length && flowDates[fi] <= d.date) {
      flow += flows.get(flowDates[fi])!;
      fi++;
    }
    if (d.total <= 0) {
      units = 0;
      uv = STARTING_UNIT_VALUE;
      continue;
    }
    if (units <= 0) {
      // First funded day: everything in the account is starting capital.
      units = d.total / STARTING_UNIT_VALUE;
    } else {
      units += flow / uv;
      if (units <= 0) units = d.total / uv;
    }
    uv = d.total / units;
    out.push({
      date: d.date,
      totalValueUsd: d.total,
      cashUsd: d.cash,
      investedUsd: d.total - d.cash,
      unitValueUsd: uv,
      spyPrice: NaN,
    });
  }
  return out;
}

export class IbkrBroker implements BrokerAdapter {
  readonly name = "Interactive Brokers";
  readonly isSample = false;

  private token = process.env.IBKR_FLEX_TOKEN ?? "";
  private queryId = process.env.IBKR_FLEX_QUERY_ID ?? "";

  private async statement(): Promise<FlexStatement> {
    if (!this.token || !this.queryId) {
      throw new Error(
        "IBKR not configured: set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID (see docs/IBKR_SETUP.md).",
      );
    }
    if (cache && Date.now() - cache.at < FLEX_TTL_MS) return cache.stmt;
    if (!inflight) {
      inflight = fetchFlexStatement(this.token, this.queryId)
        .then((stmt) => {
          cache = { at: Date.now(), stmt };
          return stmt;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  async getMeta(): Promise<BrokerMeta> {
    const s = await this.statement();
    return { currency: s.baseCurrency, asOf: s.toDate };
  }

  async getAccount(): Promise<AccountState> {
    const stmt = await this.statement();
    const positions = mapPositions(stmt);
    const history = buildHistory(stmt);
    const last = history[history.length - 1];
    const investedUsd = positions.reduce((s, p) => s + p.marketValueUsd, 0);
    if (last) {
      return {
        totalValueUsd: last.totalValueUsd,
        cashUsd: last.cashUsd,
        investedUsd: last.totalValueUsd - last.cashUsd,
        positions,
      };
    }
    // No NAV section in the query — fall back to summing positions.
    return { totalValueUsd: investedUsd, cashUsd: 0, investedUsd, positions };
  }

  async getTrades(): Promise<Trade[]> {
    return mapTrades(await this.statement());
  }

  async getHistory(): Promise<Snapshot[]> {
    return buildHistory(await this.statement());
  }
}
