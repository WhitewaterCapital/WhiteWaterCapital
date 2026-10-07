import "server-only";
import { promises as fs } from "fs";
import path from "path";

// SEC EDGAR insider (Form 4) source — REAL DATA.
//
// Reads public/data/insider/latest.json, written by `npm run refresh:insider`
// (scripts/refresh-insider.mts): open-market Form 4 purchases and sales from
// SEC EDGAR, 10b5-1 planned sales excluded, buys weighted 3× sales, role-
// weighted, with an evidence shrink so a single trade can't read as maximal.
// (This replaced a hard-coded synthetic posture table, 2026-10.)
//
// Contract: a ticker the refresh didn't cover → "not_found"; no export →
// "unreachable". Never a fabricated read.

export interface InsiderTransactionsSummary {
  signalTransactionCount: number;
  score: number; // -100..100, sign = net buying(+)/selling(-)
  netDirection: number; // >0 net buyers, <0 net sellers, 0 mixed
  buyCount: number;
  sellCount: number;
  distinctInsiders: number;
  buyValueUsd?: number;
  sellValueUsd?: number;
  plannedSalesExcluded?: number;
}

export interface InsiderTransactionsResult {
  status: "ok" | "not_found" | "unreachable";
  message?: string;
  windowDays?: number;
  asOf?: string;
  provenance?: "synthetic-demo" | "live";
  summary?: InsiderTransactionsSummary;
}

type InsiderExport = {
  as_of: string;
  window_days: number;
  provenance: "live";
  tickers: { ticker: string; error?: string; summary?: InsiderTransactionsSummary }[];
};

const FILE = path.join(process.cwd(), "public", "data", "insider", "latest.json");

async function load(): Promise<InsiderExport | null> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as InsiderExport;
  } catch {
    return null;
  }
}

// `opts.windowDays` is informational: the refresh uses one fixed window
// (window_days in the export) and the result reports which one was used.
export async function fetchInsiderTransactions(
  ticker: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts?: { windowDays?: number },
): Promise<InsiderTransactionsResult> {
  const data = await load();
  if (!data) {
    return {
      status: "unreachable",
      message: "insider feed not refreshed yet — run `npm run refresh:insider`",
    };
  }
  const row = data.tickers.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase());
  if (!row || row.error || !row.summary) {
    return {
      status: "not_found",
      message: row?.error ?? `${ticker} isn't in the insider refresh universe`,
      windowDays: data.window_days,
      asOf: data.as_of,
    };
  }
  return {
    status: "ok",
    windowDays: data.window_days,
    asOf: data.as_of,
    provenance: "live",
    summary: row.summary,
  };
}
