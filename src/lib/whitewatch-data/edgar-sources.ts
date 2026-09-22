// SEC EDGAR insider (Form 4) source.
//
// The real implementation would query SEC EDGAR's Form 4 filings at request
// time to build an open-market insider buy/sell read for a ticker. Until that
// live feed is wired, this returns a DETERMINISTIC synthetic-demo insider read
// so the pages that use it (smart-money, earnings) are complete and decisive
// rather than showing a hollow "not connected" state. The reads are fixed,
// reproducible, and clearly illustrative — the pages label them as such. They
// are deliberately not always aligned with momentum: some insiders buy into
// weakness, some sell into strength, which is exactly the nuance the models
// are meant to weigh.
//
// To go live: replace `fetchInsiderTransactions` with a real SEC EDGAR Form 4
// client (respecting the SEC User-Agent requirement) returning the same shape.

export interface InsiderTransactionsSummary {
  signalTransactionCount: number;
  score: number; // -100..100, sign = net buying(+)/selling(-)
  netDirection: number; // >0 net buyers, <0 net sellers, 0 mixed
  buyCount: number;
  sellCount: number;
  distinctInsiders: number;
}

export interface InsiderTransactionsResult {
  status: "ok" | "not_found" | "unreachable";
  message?: string;
  windowDays?: number;
  provenance?: "synthetic-demo" | "live";
  summary?: InsiderTransactionsSummary;
}

// Fixed per-ticker insider posture (illustrative). Positive = net buying.
// Chosen so several names DISAGREE with their momentum, to exercise the
// models' "signals conflict" handling honestly.
const POSTURE: Record<string, number> = {
  NVDA: -32, // insiders selling into a strong run
  MSFT: 28, // insiders adding alongside momentum
  AAPL: 14,
  GOOGL: 10,
  AMZN: -8,
  JPM: 22,
  BAC: 16,
  GS: -12,
  XOM: 34, // insiders buying a soft-momentum name
  CVX: 20,
  KO: -6,
  PEP: 4,
  JNJ: 12,
  PFE: 30, // heavy insider buying into weakness
  F: 18,
  GM: -14,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 2 ** 32; // 0..1
}

export async function fetchInsiderTransactions(
  ticker: string,
  opts?: { windowDays?: number },
): Promise<InsiderTransactionsResult> {
  const key = ticker.toUpperCase();
  const score = key in POSTURE ? POSTURE[key] : Math.round((hash(key) - 0.5) * 60);
  const r = hash(key + "n");
  const distinctInsiders = 1 + Math.floor(hash(key + "i") * 4); // 1..4
  // Split a plausible buy/sell count consistent with the net score.
  const total = 2 + Math.floor(r * 5); // 2..6 signal transactions
  let buyCount = Math.round((total * (score + 100)) / 200);
  buyCount = Math.max(0, Math.min(total, buyCount));
  const sellCount = total - buyCount;

  return {
    status: "ok",
    windowDays: opts?.windowDays,
    provenance: "synthetic-demo",
    summary: {
      signalTransactionCount: total,
      score,
      netDirection: Math.sign(score),
      buyCount,
      sellCount,
      distinctInsiders,
    },
  };
}
