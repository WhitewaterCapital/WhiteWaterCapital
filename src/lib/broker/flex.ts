// ---------------------------------------------------------------------------
// IBKR Flex Web Service client — READ-ONLY.
//
// Why Flex (and not the Client Portal gateway): Flex is a plain HTTPS pull
// with a read-only token. No gateway to keep logged in, no 2FA session to
// babysit, and it runs fine from a Vercel function. It cannot place orders —
// which is exactly what we want (decision-support, never auto-trading).
//
// Trade-off: Flex statements are end-of-day (as of the last close), not tick
// live. The UI labels the "as of" date so nobody mistakes it for intraday.
//
// Two-step protocol:
//   1. SendRequest?t=TOKEN&q=QUERY_ID&v=3  -> <ReferenceCode> + <Url>
//   2. <Url>?t=TOKEN&q=REFERENCE_CODE&v=3  -> the FlexQueryResponse XML
//      (may answer ErrorCode 1019 "generation in progress" — poll a few times)
//
// Setup (one-time, in IBKR Portal → Performance & Reports → Flex Queries):
//   see docs/IBKR_SETUP.md in the repo.
// ---------------------------------------------------------------------------

const FLEX_BASE =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
// IBKR rejects requests with no User-Agent.
const UA = "Whitewater/1.0 (read-only Flex client)";

export type FlexRow = Record<string, string>;

export type FlexStatement = {
  accountId: string;
  baseCurrency: string; // e.g. "EUR" for an IBKR Ireland account
  fromDate: string;
  toDate: string;
  whenGenerated: string;
  openPositions: FlexRow[];
  trades: FlexRow[];
  equitySummary: FlexRow[];
  cashTransactions: FlexRow[];
};

// --- tiny XML helpers -------------------------------------------------------
// Flex XML is flat: every data row is a self-closing element whose values are
// all attributes. A focused attribute parser is enough and avoids a dependency.

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function parseAttrs(src: string): FlexRow {
  const out: FlexRow = {};
  const re = /([A-Za-z_][\w.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  return out;
}

// All elements named `tag` (self-closing or not) → their attributes.
export function rowsOf(xml: string, tag: string): FlexRow[] {
  const re = new RegExp(`<${tag}(\\s[^>]*?)?\\s*/?>`, "g");
  const rows: FlexRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) rows.push(parseAttrs(m[1] ?? ""));
  return rows;
}

function textOf(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? decodeEntities(m[1].trim()) : undefined;
}

// --- date parsing -----------------------------------------------------------
// Flex date format is user-configurable per query. Accept the common ones:
//   20260915 · 2026-09-15 · 09/15/2026 · with optional ";" / "," / " " time.
export function flexDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = raw.trim().split(/[;, T]/)[0];
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(d);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return d;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d);
  if (m) return `20${m[3]}-${m[1]}-${m[2]}`;
  return undefined;
}

// ISO datetime (UTC-naive) from a Flex date+time, e.g. "20260915;103015".
export function flexDateTime(raw: string | undefined): string | undefined {
  const date = flexDate(raw);
  if (!date || !raw) return undefined;
  const t = raw.trim().split(/[;, T]/)[1] ?? "";
  const digits = t.replace(/:/g, "");
  if (/^\d{6}$/.test(digits)) {
    return `${date}T${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
  }
  return `${date}T00:00:00`;
}

// --- parsing a full statement ----------------------------------------------

export function parseFlexStatement(xml: string): FlexStatement {
  const stmt = rowsOf(xml, "FlexStatement")[0];
  if (!stmt) {
    const msg = textOf(xml, "ErrorMessage");
    throw new Error(
      msg
        ? `IBKR Flex error: ${msg}`
        : "IBKR Flex response had no <FlexStatement> — check the query's format is XML.",
    );
  }
  const nav = rowsOf(xml, "EquitySummaryByReportDateInBase");
  const info = rowsOf(xml, "AccountInformation")[0];
  return {
    accountId: stmt.accountId ?? "",
    baseCurrency: (info?.currency || nav[0]?.currency || "USD").toUpperCase(),
    fromDate: flexDate(stmt.fromDate) ?? "",
    toDate: flexDate(stmt.toDate) ?? "",
    whenGenerated: stmt.whenGenerated ?? "",
    openPositions: rowsOf(xml, "OpenPosition"),
    trades: rowsOf(xml, "Trade"),
    equitySummary: nav,
    cashTransactions: rowsOf(xml, "CashTransaction"),
  };
}

// --- network ---------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`IBKR Flex HTTP ${res.status}`);
  return res.text();
}

// Codes IBKR documents as "try again shortly".
const RETRYABLE = new Set(["1001", "1004", "1005", "1006", "1007", "1008", "1009", "1018", "1019", "1021"]);

export async function fetchFlexStatement(
  token: string,
  queryId: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<FlexStatement> {
  const attempts = opts.attempts ?? 8;
  const delayMs = opts.delayMs ?? 2500;

  const send = await get(
    `${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`,
  );
  if (textOf(send, "Status") !== "Success") {
    const code = textOf(send, "ErrorCode");
    const msg = textOf(send, "ErrorMessage") ?? "unknown error";
    throw new Error(`IBKR Flex SendRequest failed${code ? ` (${code})` : ""}: ${msg}`);
  }
  const ref = textOf(send, "ReferenceCode");
  const base = textOf(send, "Url") ?? `${FLEX_BASE}/GetStatement`;
  if (!ref) throw new Error("IBKR Flex SendRequest returned no reference code.");

  let lastMsg = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    const xml = await get(
      `${base}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(ref)}&v=3`,
    );
    if (xml.includes("<FlexQueryResponse")) return parseFlexStatement(xml);
    const code = textOf(xml, "ErrorCode") ?? "";
    lastMsg = textOf(xml, "ErrorMessage") ?? "unexpected response";
    if (!RETRYABLE.has(code)) {
      throw new Error(`IBKR Flex GetStatement failed${code ? ` (${code})` : ""}: ${lastMsg}`);
    }
  }
  throw new Error(`IBKR Flex statement not ready after ${attempts} tries: ${lastMsg}`);
}
