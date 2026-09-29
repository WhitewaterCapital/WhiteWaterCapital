import { getBroker } from "./broker";
import type { AccountState } from "./broker/broker";
import { spyCloses } from "./market/spy";
import type { Snapshot, Trade } from "./types";

// ---------------------------------------------------------------------------
// The club's book, in one call — what every page that shows the portfolio
// should use (Desk, State of the book, Performance, public home).
//
// Pulls account + history + fills from whichever broker is active, and joins
// SPY closes onto the history for the benchmark. Never throws: if the broker
// is configured but unreachable, `error` is set and the page shows it instead
// of crashing or silently falling back to sample numbers.
// ---------------------------------------------------------------------------

export type Book = {
  source: string;
  isSample: boolean;
  asOf?: string; // last statement date (real broker only)
  currency: string; // base currency of every money amount (EUR for IBKR Ireland)
  account: AccountState;
  history: Snapshot[];
  trades: Trade[];
  hasBenchmark: boolean;
  periodsPerYear: number; // 252 for daily history, 52 for the weekly sample
  error?: string;
};

const EMPTY: AccountState = { totalValueUsd: 0, cashUsd: 0, investedUsd: 0, positions: [] };

export async function loadBook(): Promise<Book> {
  const broker = getBroker();
  try {
    const [account, rawHistory, trades] = await Promise.all([
      broker.getAccount(),
      broker.getHistory ? broker.getHistory() : Promise.resolve([] as Snapshot[]),
      broker.getTrades(),
    ]);

    const meta = broker.getMeta ? await broker.getMeta() : undefined;
    const currency = meta?.currency ?? "USD";
    let history = rawHistory;
    let hasBenchmark = history.every((s) => Number.isFinite(s.spyPrice) && s.spyPrice > 0);
    if (!hasBenchmark && history.length) {
      const spy = await spyCloses(history[0].date, currency);
      // Forward-fill across any date Yahoo lacks (holidays / IBKR-only days).
      let last = NaN;
      const sorted = [...spy.keys()].sort();
      let si = 0;
      history = history.map((s) => {
        while (si < sorted.length && sorted[si] <= s.date) last = spy.get(sorted[si++])!;
        return { ...s, spyPrice: last };
      });
      // Trim leading days before SPY data starts so the benchmark aligns.
      const firstOk = history.findIndex((s) => Number.isFinite(s.spyPrice));
      hasBenchmark = firstOk >= 0;
      if (firstOk > 0) history = history.slice(firstOk);
    }

    return {
      source: broker.name,
      isSample: broker.isSample,
      asOf: meta?.asOf,
      currency,
      account,
      history,
      trades,
      hasBenchmark,
      periodsPerYear: broker.isSample ? 52 : 252,
    };
  } catch (err) {
    return {
      source: broker.name,
      isSample: broker.isSample,
      currency: "USD",
      account: EMPTY,
      history: [],
      trades: [],
      hasBenchmark: false,
      periodsPerYear: 252,
      error: (err as Error).message,
    };
  }
}
