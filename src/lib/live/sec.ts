import "server-only";

// ---------------------------------------------------------------------------
// SEC EDGAR — free, keyless fundamentals for any US filer (10-K/10-Q) and
// foreign filers that report in XBRL (20-F/40-F, IFRS).
//   ticker → CIK (company_tickers.json) → companyfacts (every XBRL fact) and
//   submissions (name, SIC industry, recent filings).
// SEC asks for a descriptive User-Agent; set SEC_USER_AGENT to override.
// ---------------------------------------------------------------------------

const UA = {
  "User-Agent": process.env.SEC_USER_AGENT?.trim() || "Whitewater Research https://whitewater-management.vercel.app",
  Accept: "application/json",
};

async function secJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function cikFor(ticker: string): Promise<number | null> {
  const j = await secJson<Record<string, { cik_str: number; ticker: string }>>(
    "https://www.sec.gov/files/company_tickers.json",
    86400,
  );
  if (!j) return null;
  const t = ticker.toUpperCase().replace("-", ".");
  for (const r of Object.values(j)) if (r.ticker.toUpperCase() === t || r.ticker.toUpperCase() === ticker.toUpperCase()) return r.cik_str;
  return null;
}

const pad = (cik: number) => String(cik).padStart(10, "0");

export type Submissions = {
  name: string;
  sic: string;
  sicDescription: string;
  filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[]; items?: string[] } };
};

export const submissions = (cik: number) =>
  secJson<Submissions>(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, 6 * 3600);

type Fact = { end: string; start?: string; val: number; form: string; filed: string; fp?: string; fy?: number };
type CompanyFacts = { facts: Record<string, Record<string, { units: Record<string, Fact[]> }>> };

export const companyFacts = (cik: number) =>
  secJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad(cik)}.json`, 12 * 3600);

// ── standardized fields → candidate concepts (us-gaap, then IFRS) ────────────
// Broader than the Python engine's starter map — that narrowness is why some
// names (NVDA net margin, XOM) came back half-empty.
const CONCEPTS: Record<string, string[]> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "Revenue", // IFRS
  ],
  gross_profit: ["GrossProfit"],
  operating_income: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  net_income: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLossAttributableToOwnersOfParent"],
  assets: ["Assets"],
  current_assets: ["AssetsCurrent", "CurrentAssets"],
  liabilities: ["Liabilities"],
  current_liabilities: ["LiabilitiesCurrent", "CurrentLiabilities"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    "EquityAttributableToOwnersOfParent",
    "Equity",
  ],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashAndCashEquivalents"],
  long_term_debt: [
    "LongTermDebtNoncurrent",
    "LongTermDebt",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongtermBorrowings",
    "NoncurrentPortionOfNoncurrentBorrowings",
  ],
  operating_cash_flow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    "CashFlowsFromUsedInOperatingActivities",
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
  ],
};
const DURATION = new Set(["revenue", "gross_profit", "operating_income", "net_income", "operating_cash_flow", "capex"]);
const ANNUAL_FORMS = /^(10-K|20-F|40-F)/;

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400_000;

export type Fundamentals = {
  taxonomy: "us-gaap" | "ifrs-full";
  currency: string;
  periodEnd: string | null; // latest fiscal year end
  priorPeriodEnd: string | null;
  fy: Record<string, number | null>; // latest fiscal year
  fyPrior: Record<string, number | null>; // year before
  ttm: Record<string, number | null>; // trailing twelve months (duration fields)
  latest: Record<string, number | null>; // latest balance-sheet values (any filing)
  latestDate: string | null; // date of the latest balance sheet
  shares: number | null; // latest shares outstanding (all classes)
  sharesDate: string | null;
};

export function standardize(cf: CompanyFacts): Fundamentals | null {
  const tax = cf.facts["us-gaap"] ? "us-gaap" : cf.facts["ifrs-full"] ? "ifrs-full" : null;
  if (!tax) return null;
  const facts = cf.facts[tax];

  // Currency: the monetary unit most used by this filer.
  const unitCount: Record<string, number> = {};
  for (const c of Object.values(facts)) for (const u of Object.keys(c.units)) if (/^[A-Z]{3}$/.test(u)) unitCount[u] = (unitCount[u] ?? 0) + c.units[u].length;
  const currency = Object.entries(unitCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

  // All candidate concepts for a field, in preference order. Filers switch
  // tags over the years (GOOGL moved revenue concepts), so each lookup asks
  // every candidate for THAT period rather than locking onto the first tag
  // that ever had data (which left GOOGL's revenue empty — fixed).
  const allRows = (field: string): Fact[][] =>
    CONCEPTS[field].map((c) => facts[c]?.units?.[currency] ?? []).filter((r) => r.length);
  const series = (field: string): { rows: Fact[] } | null => {
    const rs = allRows(field);
    return rs.length ? { rows: rs.flat() } : null;
  };

  // Latest fiscal-year end = latest annual-form revenue/net income/assets period.
  const annualEnds = new Set<string>();
  for (const f of ["revenue", "net_income", "assets"]) {
    const s = series(f);
    s?.rows.forEach((r) => {
      if (ANNUAL_FORMS.test(r.form) && (!r.start || (days(r.start, r.end) > 330 && days(r.start, r.end) < 400))) annualEnds.add(r.end);
    });
  }
  const ends = [...annualEnds].sort();
  const periodEnd = ends.at(-1) ?? null;
  const priorPeriodEnd = ends.filter((e) => periodEnd && days(e, periodEnd) > 300 && days(e, periodEnd) < 430).at(-1) ?? null;

  // Value for a field at a fiscal-year end (annual duration, or instant).
  const atYear = (field: string, end: string | null): number | null => {
    if (!end) return null;
    for (const rows of allRows(field)) {
      // first concept (in preference order) that reports this period wins;
      // within it, the latest filing (restatement) wins.
      const hits = rows
        .filter((r) => r.end === end && (DURATION.has(field) ? r.start && days(r.start, r.end) > 330 && days(r.start, r.end) < 400 : !r.start))
        .sort((a, b) => b.filed.localeCompare(a.filed));
      if (hits.length) return hits[0].val;
    }
    return null;
  };

  const fields = Object.keys(CONCEPTS);
  const fy = Object.fromEntries(fields.map((f) => [f, atYear(f, periodEnd)]));
  const fyPrior = Object.fromEntries(fields.map((f) => [f, atYear(f, priorPeriodEnd)]));

  // TTM for duration fields: FY + current YTD − prior-year YTD (same length),
  // when a 10-Q/6-K YTD period ends after the fiscal year.
  const ttm: Record<string, number | null> = {};
  for (const f of fields.filter((x) => DURATION.has(x))) {
    const base = fy[f];
    // TTM must use ONE concept consistently (the one that reported the FY).
    const conceptRows = allRows(f).find((rows) =>
      rows.some((r) => r.end === periodEnd && r.start && days(r.start, r.end) > 330 && days(r.start, r.end) < 400),
    );
    const s = conceptRows ? { rows: conceptRows } : null;
    if (!s || base == null || !periodEnd) {
      ttm[f] = base;
      continue;
    }
    const ytd = s.rows
      .filter((r) => r.start && r.end > periodEnd && days(r.start, r.end) > 80 && days(r.start, r.end) < 300)
      .filter((r) => Math.abs(days(periodEnd, r.start!)) < 20) // starts right after FY end (a YTD, not a lone quarter)
      .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
    if (!ytd) {
      ttm[f] = base;
      continue;
    }
    const len = days(ytd.start!, ytd.end);
    const prior = s.rows.find(
      (r) => r.start && Math.abs(days(r.start, r.end) - len) < 12 && Math.abs(days(r.end, ytd.end) - 365) < 20,
    );
    ttm[f] = prior ? base + ytd.val - prior.val : base;
  }

  // Latest balance sheet (instant facts from any filing).
  const latestInstant = (field: string): { val: number; end: string } | null => {
    const s = series(field);
    if (!s) return null;
    const r = s.rows.filter((x) => !x.start).sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
    return r ? { val: r.val, end: r.end } : null;
  };
  const latest: Record<string, number | null> = {};
  let latestDate: string | null = null;
  for (const f of fields.filter((x) => !DURATION.has(x))) {
    const li = latestInstant(f);
    latest[f] = li?.val ?? null;
    if (f === "assets" && li) latestDate = li.end;
  }

  // Shares outstanding: dei cover-page count, summed across share classes at
  // the latest date (GOOGL/BRK have several); else us-gaap.
  let shares: number | null = null;
  let sharesDate: string | null = null;
  const dei = cf.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares;
  if (dei?.length) {
    const lastEnd = dei.map((r) => r.end).sort().at(-1)!;
    const lastFiled = dei.filter((r) => r.end === lastEnd).map((r) => r.filed).sort().at(-1)!;
    shares = dei.filter((r) => r.end === lastEnd && r.filed === lastFiled).reduce((a, r) => a + r.val, 0);
    sharesDate = lastEnd;
  } else {
    const r = facts.CommonStockSharesOutstanding?.units?.shares?.sort((a, b) => b.end.localeCompare(a.end))[0];
    if (r) {
      shares = r.val;
      sharesDate = r.end;
    }
  }

  return { taxonomy: tax, currency, periodEnd, priorPeriodEnd, fy, fyPrior, ttm, latest, latestDate, shares, sharesDate };
}

// Piotroski F-score — same 9 signals as engine/incepta/models/quality.py,
// counting only the tests the filings allow (score / max).
export function piotroski(c: Record<string, number | null>, p: Record<string, number | null>): { score: number; max: number } {
  let score = 0;
  let max = 0;
  const add = (cond: boolean | null) => {
    if (cond == null) return;
    max++;
    if (cond) score++;
  };
  const r = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
  const roaC = r(c.net_income, c.assets);
  const roaP = r(p.net_income, p.assets);
  add(roaC != null ? roaC > 0 : null);
  add(c.operating_cash_flow != null ? c.operating_cash_flow > 0 : null);
  add(roaC != null && roaP != null ? roaC > roaP : null);
  add(c.operating_cash_flow != null && c.assets && roaC != null ? c.operating_cash_flow / c.assets > roaC : null);
  const levC = r(c.long_term_debt, c.assets);
  const levP = r(p.long_term_debt, p.assets);
  add(levC != null && levP != null ? levC < levP : null);
  const crC = r(c.current_assets, c.current_liabilities);
  const crP = r(p.current_assets, p.current_liabilities);
  add(crC != null && crP != null ? crC > crP : null);
  // (share dilution needs per-year share counts — not in this map; skipped, so max ≤ 8)
  const gmC = r(c.gross_profit, c.revenue);
  const gmP = r(p.gross_profit, p.revenue);
  add(gmC != null && gmP != null ? gmC > gmP : null);
  const atC = r(c.revenue, c.assets);
  const atP = r(p.revenue, p.assets);
  add(atC != null && atP != null ? atC > atP : null);
  return { score, max };
}
