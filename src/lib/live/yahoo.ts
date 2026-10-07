import "server-only";

// ---------------------------------------------------------------------------
// Yahoo Finance — free, keyless market data for ANY listed ticker:
//   • daily price history (split + dividend adjusted) and the latest quote
//   • ticker/company search (autocomplete, name → symbol)
//   • the per-ticker headline feed
// Every call is cached by Next's fetch cache and bounded by a timeout.
// ---------------------------------------------------------------------------

const UA = { "User-Agent": "Mozilla/5.0 (Whitewater research)" };

// `close` is split+dividend ADJUSTED (for returns/vol); `rawClose` is the
// printed close (for quotes and day change, comparable to the live price).
export type Bar = { date: string; open: number; high: number; low: number; close: number; rawClose: number; volume: number };

export type Quote = {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  price: number | null;
  previousClose: number | null;
  change: number | null; // fraction
  marketTime: string | null;
};

// Daily bars, adjusted (OHLC scaled by adjclose/close). Drops today's unsettled bar.
export async function dailyBars(
  symbol: string,
  years = 6,
): Promise<{ bars: Bar[]; quote: Quote } | null> {
  const now = Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${now - years * 366 * 86400}&period2=${now + 86400}&interval=1d&includePrePost=false`;
  let j;
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate: 900 }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    j = await res.json();
  } catch {
    return null;
  }
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const m = r.meta ?? {};
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const adj: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? [];
  const tz = m.exchangeTimezoneName ?? "America/New_York";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const bars: Bar[] = [];
  ts.forEach((t, i) => {
    const c = q.close?.[i];
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    if (c == null || o == null || h == null || l == null || c <= 0) return;
    const a = adj[i] ?? c;
    const f = a / c;
    const date = new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: tz });
    if (date >= today) return; // unsettled
    bars.push({ date, open: o * f, high: h * f, low: l * f, close: a, rawClose: c, volume: q.volume?.[i] ?? 0 });
  });
  const price = typeof m.regularMarketPrice === "number" ? m.regularMarketPrice : bars.at(-1)?.rawClose ?? null;
  // Previous close = the settled bar before the market-time session. If the
  // latest settled bar IS the current session (after hours / pre-market next
  // day), step back one more so the day's change isn't reported as 0.
  const mtDate = m.regularMarketTime
    ? new Date(m.regularMarketTime * 1000).toLocaleDateString("en-CA", { timeZone: tz })
    : null;
  const last = bars.at(-1);
  const prev = last ? (mtDate && last.date >= mtDate ? bars.at(-2)?.rawClose ?? null : last.rawClose) : null;
  return {
    bars,
    quote: {
      symbol: m.symbol ?? symbol,
      name: m.longName ?? m.shortName ?? null,
      currency: m.currency ?? null,
      exchange: m.fullExchangeName ?? m.exchangeName ?? null,
      price,
      previousClose: prev,
      change: price != null && prev ? price / prev - 1 : null,
      marketTime: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    },
  };
}

export type SearchHit = { symbol: string; name: string; exchange: string; type: string };

// Ticker / company search for the search bar (equities + ETFs).
export async function searchSymbols(q: string): Promise<SearchHit[]> {
  if (!q.trim()) return [];
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true`,
      { headers: UA, next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const j = await res.json();
    return (j.quotes ?? [])
      .filter((x: { quoteType?: string }) => x.quoteType === "EQUITY" || x.quoteType === "ETF")
      .map((x: { symbol: string; longname?: string; shortname?: string; exchDisp?: string; quoteType: string }) => ({
        symbol: x.symbol,
        name: x.longname ?? x.shortname ?? x.symbol,
        exchange: x.exchDisp ?? "",
        type: x.quoteType,
      }));
  } catch {
    return [];
  }
}

export type RawNews = { title: string; url: string; source: string; publishedAt: string | null; summary?: string };

// Yahoo's per-ticker headline RSS.
export async function yahooHeadlines(symbol: string): Promise<RawNews[]> {
  try {
    const res = await fetch(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
      { headers: UA, next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    return parseRss(await res.text(), "Yahoo Finance");
  } catch {
    return [];
  }
}

// Minimal RSS parser (title/link/pubDate/description/source).
export function parseRss(xml: string, fallbackSource: string): RawNews[] {
  const items = xml.split(/<item[\s>]/).slice(1);
  const pick = (s: string, tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(s);
    if (!m) return "";
    return m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim();
  };
  const decode = (s: string) =>
    s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'");
  return items
    .map((it) => {
      const date = pick(it, "pubDate");
      return {
        title: decode(pick(it, "title")),
        url: decode(pick(it, "link")),
        source: decode(pick(it, "source")) || fallbackSource,
        publishedAt: date ? new Date(date).toISOString() : null,
        summary: decode(pick(it, "description")).slice(0, 280) || undefined,
      };
    })
    .filter((n) => n.title && n.url);
}
