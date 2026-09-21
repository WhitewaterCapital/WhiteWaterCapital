// SEC EDGAR insider (Form 4) source — HONEST STUB.
//
// The real implementation would query SEC EDGAR's Form 4 filings at request
// time to build an open-market insider buy/sell read for a ticker. That feed
// is not wired into this site (no edgar-sources module was ever committed to
// the platform repo, and a runtime SEC fetch on every /earnings render is not
// something to ship un-hardened). Rather than fabricate insider activity or
// crash the page, this returns an explicit "not connected" status so
// `earnings-move.ts`'s `insiderPrePrintFor` degrades to a labeled
// "insider signal unavailable" read — the same honesty convention every other
// unconnected data source on this site uses.
//
// To activate: replace this with a real SEC EDGAR Form 4 client (respecting
// the SEC's User-Agent requirement) that returns the `summary` shape below.

export interface InsiderTransactionsSummary {
  signalTransactionCount: number;
  score: number;
  netDirection: number; // >0 net buyers, <0 net sellers, 0 mixed
  buyCount: number;
  sellCount: number;
}

export interface InsiderTransactionsResult {
  status: "ok" | "not_found" | "unreachable";
  message?: string;
  windowDays?: number;
  summary?: InsiderTransactionsSummary;
}

export async function fetchInsiderTransactions(
  _ticker: string,
  opts?: { windowDays?: number },
): Promise<InsiderTransactionsResult> {
  return {
    status: "unreachable",
    windowDays: opts?.windowDays,
    message:
      "SEC EDGAR insider (Form 4) feed not connected — the insider pre-print signal is unavailable in this environment.",
  };
}
