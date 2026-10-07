// ---------------------------------------------------------------------------
// SEC EDGAR Form 4 — open-market insider buying/selling for any US issuer.
// Shared by the daily refresh (scripts/refresh-insider.mts) and the live
// ticker desk. Method (Lakonishok & Lee 2001; Cohen, Malloy & Pomorski 2012):
//   • only open-market trades: P (purchase) / S (sale); grants, exercises,
//     tax withholding and gifts are not signals
//   • 10b5-1 planned sales excluded; filings where the company itself is the
//     reporting owner of OTHER issuers are excluded (issuer-CIK check)
//   • buys weighted 3× sales; CEO/CFO/President 1.5, officers 1.2,
//     directors 1.0, 10% owners 0.8
//   score = 100·(B − S/3)/(B + S/3) · (1 − e^(−n/3))  (evidence shrink)
// No "server-only" import: the Node refresh script uses it too.
// ---------------------------------------------------------------------------

const UA = process.env.SEC_USER_AGENT?.trim() || "Whitewater Research https://whitewater-management.vercel.app";
export const WINDOW_DAYS = 90;
const MAX_FILINGS = 80;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function sec(url: string): Promise<Response> {
  const gap = Date.now() - last;
  if (gap < 130) await sleep(130 - gap); // ≤ ~8 req/s, under SEC's 10/s
  last = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json, text/xml" },
      // Filings never change once published; listings refresh twice a day.
      ...(/Archives\/edgar/.test(url) ? { cache: "force-cache" as RequestCache } : {}),
      signal: AbortSignal.timeout(15000),
    } as RequestInit);
    if (res.status !== 429 && res.status < 500) return res;
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`SEC request kept failing: ${url}`);
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${name}>`).exec(xml);
  return m ? decode(m[1].trim()) : null;
};
const blocks = (xml: string, name: string): string[] =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);

type Txn = {
  date: string;
  insider: string;
  role: string;
  code: "P" | "S";
  shares: number;
  price: number;
  value: number;
  plan10b51: boolean;
};

function roleOf(xml: string): { role: string; weight: number } {
  const rel = blocks(xml, "reportingOwnerRelationship")[0] ?? "";
  const title = (tag(rel, "officerTitle") ?? "").toLowerCase();
  const on = (n: string) => /^(1|true)$/i.test(tag(rel, n) ?? "");
  if (on("isOfficer")) {
    if (/chief executive|ceo|chief financial|cfo|president/.test(title)) return { role: tag(rel, "officerTitle") ?? "Officer", weight: 1.5 };
    return { role: tag(rel, "officerTitle") || "Officer", weight: 1.2 };
  }
  if (on("isDirector")) return { role: "Director", weight: 1.0 };
  if (on("isTenPercentOwner")) return { role: "10% owner", weight: 0.8 };
  return { role: "Other", weight: 0.8 };
}

function parseForm4(xml: string, issuerCik: number): (Txn & { weight: number })[] {
  // A company's submissions list also contains Form 4s it filed AS AN OWNER of
  // other issuers (e.g. Goldman reporting trades in a fund it holds 10% of).
  // Those are not insider trades in this stock — keep only our issuer.
  if (Number(tag(xml, "issuerCik") ?? -1) !== issuerCik) return [];
  const owner = tag(xml, "rptOwnerName") ?? "Unknown";
  const { role, weight } = roleOf(xml);
  // Newer forms flag 10b5-1 at document level; older ones only in footnotes.
  const plan =
    /^(1|true)$/i.test(tag(xml, "aff10b5One") ?? "") || /10b5-1/i.test(blocks(xml, "footnotes")[0] ?? "");
  const out: (Txn & { weight: number })[] = [];
  for (const t of blocks(xml, "nonDerivativeTransaction")) {
    const code = tag(t, "transactionCode");
    if (code !== "P" && code !== "S") continue;
    const shares = Number(tag(t, "transactionShares"));
    const price = Number(tag(t, "transactionPricePerShare"));
    if (!(shares > 0) || !(price > 0)) continue;
    out.push({
      date: tag(t, "transactionDate") ?? "",
      insider: owner,
      role,
      code,
      shares,
      price,
      value: shares * price,
      plan10b51: code === "S" && plan,
      weight,
    });
  }
  return out;
}

export async function cikMap(): Promise<Map<string, number>> {
  const j = (await (await sec("https://www.sec.gov/files/company_tickers.json")).json()) as Record<
    string,
    { cik_str: number; ticker: string }
  >;
  return new Map(Object.values(j).map((r) => [r.ticker.toUpperCase(), r.cik_str]));
}

export async function insiderFor(ticker: string, cik: number, since: string, maxFilings = MAX_FILINGS) {
  const subs = await (await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)).json();
  const r = subs.filings.recent as { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] };
  const idx = r.form
    .map((f, i) => i)
    .filter((i) => r.form[i] === "4" && r.filingDate[i] >= since)
    .slice(0, maxFilings);
  const txns: (Txn & { weight: number })[] = [];
  for (const i of idx) {
    const acc = r.accessionNumber[i].replace(/-/g, "");
    const doc = r.primaryDocument[i].split("/").pop(); // drop the xsl render dir
    try {
      const res = await sec(`https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${doc}`);
      if (res.ok) txns.push(...parseForm4(await res.text(), cik));
    } catch {
      /* one bad filing never sinks the ticker */
    }
  }
  const signal = txns.filter((t) => t.date >= since && !t.plan10b51);
  const B = signal.filter((t) => t.code === "P").reduce((a, t) => a + t.value * t.weight, 0);
  const S = signal.filter((t) => t.code === "S").reduce((a, t) => a + t.value * t.weight, 0);
  const denom = B + S / 3;
  // Direction from the dollar balance; strength shrunk by how much evidence
  // there is, so one small trade can't read as a maximal signal:
  // n=1 → ×0.28, n=3 → ×0.63, n=6 → ×0.86.
  const raw = denom > 0 ? (100 * (B - S / 3)) / denom : 0;
  const score = Math.round(raw * (1 - Math.exp(-signal.length / 3)));
  const buys = signal.filter((t) => t.code === "P");
  const sells = signal.filter((t) => t.code === "S");
  return {
    ticker,
    cik,
    form4_filings_scanned: idx.length,
    summary: {
      signalTransactionCount: signal.length,
      score,
      netDirection: Math.sign(score),
      buyCount: buys.length,
      sellCount: sells.length,
      distinctInsiders: new Set(signal.map((t) => t.insider)).size,
      buyValueUsd: Math.round(buys.reduce((a, t) => a + t.value, 0)),
      sellValueUsd: Math.round(sells.reduce((a, t) => a + t.value, 0)),
      plannedSalesExcluded: txns.filter((t) => t.date >= since && t.plan10b51).length,
    },
    transactions: signal
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 25)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ weight: _w, ...t }) => ({ ...t, value: Math.round(t.value) })),
  };
}

