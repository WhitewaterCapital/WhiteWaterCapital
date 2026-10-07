import "server-only";

// ---------------------------------------------------------------------------
// Nasdaq's public quote/analyst API (free, keyless) — for US-listed stocks:
//   • summary: market cap (handles multi-class names like BRK correctly),
//     sector, industry, the Street's 1-year price target
//   • earnings: next report date, consensus EPS, last year's EPS, and the
//     number of analyst estimate revisions up/down over the last 4 weeks
// ---------------------------------------------------------------------------

const H = { "User-Agent": "Mozilla/5.0 (Whitewater research)", Accept: "application/json" };
const sym = (t: string) => t.toUpperCase().replace("-", ".");

async function nq<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: H, next: { revalidate: 3 * 3600 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return ((await res.json()) as { data: T | null }).data;
  } catch {
    return null;
  }
}

const num = (s: unknown): number | null => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (typeof s !== "string") return null;
  const m = s.replace(/[$,%\s]/g, "");
  const v = Number(m);
  return m && Number.isFinite(v) ? v : null;
};

export type NasdaqSummary = {
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  target1y: number | null;
  dividendYield: number | null; // fraction
};

export async function nasdaqSummary(ticker: string): Promise<NasdaqSummary | null> {
  const d = await nq<{ summaryData?: Record<string, { value?: string }> }>(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym(ticker))}/summary?assetclass=stocks`,
  );
  const s = d?.summaryData;
  if (!s) return null;
  const v = (k: string) => s[k]?.value ?? null;
  const clean = (x: string | null) => (x && x !== "N/A" ? x : null);
  const y = num(v("Yield"));
  return {
    marketCap: num(v("MarketCap")),
    sector: clean(v("Sector")),
    industry: clean(v("Industry")),
    target1y: num(v("OneYrTarget")),
    dividendYield: y != null ? y / 100 : null,
  };
}

export type EarningsOutlook = {
  date: string | null; // ISO
  dateIsEstimate: boolean;
  consensusEps: number | null;
  epsYearAgo: number | null;
  nEstimates: number | null;
  revisionsUp: number | null; // last 4 weeks
  revisionsDown: number | null;
  fiscalQuarter: string | null;
};

export async function earningsOutlook(ticker: string): Promise<EarningsOutlook | null> {
  const [dateD, fc] = await Promise.all([
    nq<{ reportText?: string; announcement?: string }>(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(sym(ticker))}/earnings-date`),
    nq<{ quarterlyForecast?: { rows?: Record<string, unknown>[] } }>(
      `https://api.nasdaq.com/api/analyst/${encodeURIComponent(sym(ticker))}/earnings-forecast`,
    ),
  ]);
  if (!dateD && !fc) return null;
  const text = dateD?.reportText ?? "";
  const dm = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  const lastYear = /same quarter last year was \$?(-?[\d.]+)/i.exec(text);
  const row = fc?.quarterlyForecast?.rows?.[0] ?? {};
  return {
    date: dm ? `${dm[3]}-${dm[1]}-${dm[2]}` : null,
    dateIsEstimate: /estimated|derived from an algorithm/i.test(text),
    consensusEps: num(row.consensusEPSForecast) ?? num(/consensus EPS forecast for the quarter is \$?(-?[\d.]+)/i.exec(text)?.[1]),
    epsYearAgo: lastYear ? num(lastYear[1]) : null,
    nEstimates: num(row.noOfEstimates),
    revisionsUp: num(row.up),
    revisionsDown: num(row.down),
    fiscalQuarter: typeof row.fiscalEnd === "string" ? row.fiscalEnd : null,
  };
}
