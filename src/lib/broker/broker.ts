import type { Position, Snapshot, Trade } from "../types";

// ---------------------------------------------------------------------------
// Broker adapter interface.
//
// The rest of the app only ever talks to a `BrokerAdapter` — never directly to
// Interactive Brokers, Alpaca, or anything else. Swapping brokers = writing one
// new adapter and changing one line in `getBroker()`. That keeps the UI and the
// unit/metrics math totally decoupled from whichever broker you actually use.
// ---------------------------------------------------------------------------

// NOTE: the `*Usd` field names are historical — amounts are in the account's
// BASE currency (see BrokerMeta.currency; EUR for the club's IBKR Ireland acct).
export interface AccountState {
  totalValueUsd: number;
  cashUsd: number;
  investedUsd: number;
  positions: Position[];
}

export interface BrokerAdapter {
  readonly name: string;
  // True when the numbers are placeholder sample data, not the club's real
  // book. The UI MUST surface this so no one mistakes it for live performance.
  readonly isSample: boolean;

  // Live account snapshot: value, cash, and open positions.
  getAccount(): Promise<AccountState>;

  // Recent fills, for the activity feed and tax lots.
  getTrades(): Promise<Trade[]>;

  // Historical account-value points, for the equity curve. Some brokers expose
  // this directly; otherwise the app builds it from stored snapshots instead.
  getHistory?(): Promise<Snapshot[]>;

  // Base currency + statement date, when the broker knows them.
  getMeta?(): Promise<BrokerMeta>;
}

export type BrokerMeta = { currency: string; asOf?: string };
