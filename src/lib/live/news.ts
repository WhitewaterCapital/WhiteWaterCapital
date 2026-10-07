import "server-only";
import { parseRss, yahooHeadlines, type RawNews } from "./yahoo";

// ---------------------------------------------------------------------------
// News for a ticker, in three rings:
//   direct   — the company itself (Yahoo ticker feed, Google News, GDELT)
//   industry — its industry, not the name (competitors, supply chain, demand)
//   macro    — rates, the Fed, inflation: what moves every stock
// Every headline is deduplicated, dated, and tagged with a tone from a small
// finance lexicon (Loughran-McDonald style). Free sources, cached ~15 min.
// ---------------------------------------------------------------------------

export type Tone = "positive" | "negative" | "neutral";
export type NewsItem = RawNews & { ring: "direct" | "industry" | "macro"; tone: Tone };

const POS = [
  "beat", "beats", "tops", "raise", "raises", "raised", "upgrade", "upgraded", "record", "surge", "surges", "soar",
  "soars", "jump", "jumps", "rall", "strong", "outperform", "buyback", "repurchase", "wins", "win ", "approval",
  "approved", "expand", "partnership", "accelerat", "boost", "gains", "bullish", "upbeat", "beats estimates",
];
const NEG = [
  "miss", "misses", "cut", "cuts", "downgrade", "lawsuit", "sued", "probe", "investigat", "recall", "plunge", "plunges",
  "fall", "falls", "drop", "drops", "slump", "weak", "layoff", "warn", "loss", "decline", "sell-off", "selloff",
  "fraud", "delay", "tariff", "halt", "slash", "sink", "tumble", "bearish", "short seller", "worsening",
];

// Directionally ambiguous words ("higher", "lower", "climb", "risk") are left
// out on purpose: "higher rates" is bad news, "higher sales" good.
// Word-START matching ("cut" must not fire on "execute"; "rall" = rally/rallies).
const rx = (words: string[]) => words.map((w) => new RegExp(`\\b${w.trim().replace(/[-]/g, "[- ]?")}`, "i"));
const POS_RX = rx(POS);
const NEG_RX = rx(NEG);

export function toneOf(text: string): Tone {
  const p = POS_RX.filter((r) => r.test(text)).length;
  const n = NEG_RX.filter((r) => r.test(text)).length;
  return p > n ? "positive" : n > p ? "negative" : "neutral";
}

// "ON Semiconductor Corporation" → "ON Semiconductor"
export function shortName(name: string | null, ticker: string): string {
  if (!name) return ticker;
  return name
    .replace(/,?\s+(incorporated|inc\.?|corp\.?|corporation|company|co\.?|holdings?|group|ltd\.?|limited|plc|s\.a\.|n\.v\.|ag|class [abc].*|common stock.*)$/i, "")
    .replace(/,?\s+(incorporated|inc\.?|corp\.?|corporation|holdings?|ltd\.?|plc)$/i, "")
    .trim() || ticker;
}

async function googleNews(query: string, max = 40): Promise<RawNews[]> {
  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    return parseRss(await res.text(), "Google News").slice(0, max).map((n) => {
      // Google appends " - Publisher" to titles; split it out as the source.
      const m = /^(.*) - ([^-]{2,60})$/.exec(n.title);
      return m ? { ...n, title: m[1], source: m[2] } : n;
    });
  } catch {
    return [];
  }
}

async function gdelt(query: string): Promise<RawNews[]> {
  try {
    const res = await fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query + " sourcelang:eng")}&mode=artlist&format=json&maxrecords=30&sort=datedesc&timespan=7d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const j = await res.json();
    return (j.articles ?? []).map((a: { title: string; url: string; domain: string; seendate?: string }) => {
      const d = a.seendate;
      const iso = d && d.length >= 15 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:00Z` : null;
      return { title: a.title, url: a.url, source: a.domain, publishedAt: iso };
    });
  } catch {
    return [];
  }
}

// Quote/chart/profile pages that search feeds return alongside real stories.
const NOT_NEWS = /(\bstock (price|chart|quote)\b|\bnews \|| \| (nasdaq|nyse)|\bquote & history\b|\bshare price\b.*\bchart\b|^\w+ stock$)/i;

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))) {
    const k = n.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 70);
    if (!k || seen.has(k) || NOT_NEWS.test(n.title)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

const tag = (ring: NewsItem["ring"]) => (n: RawNews): NewsItem => ({ ...n, ring, tone: toneOf(`${n.title} ${n.summary ?? ""}`) });

export type TickerNews = { direct: NewsItem[]; industry: NewsItem[]; macro: NewsItem[]; queries: Record<string, string> };

export async function newsFor(ticker: string, name: string | null, industry: string | null): Promise<TickerNews> {
  const co = shortName(name, ticker);
  const qDirect = `"${co}" OR "${ticker} stock" when:14d`;
  const qIndustry = industry ? `${industry.replace(/[:&]/g, " ")} stocks when:7d -"${co}"` : "";
  const qMacro = `(Federal Reserve OR inflation OR "Treasury yields" OR "jobs report" OR tariffs) markets when:3d`;

  const [yh, gn, gd, ind, mac] = await Promise.all([
    yahooHeadlines(ticker),
    googleNews(qDirect),
    gdelt(`"${co}"`),
    qIndustry ? googleNews(qIndustry, 25) : Promise.resolve([]),
    googleNews(qMacro, 20),
  ]);

  // Keep direct items that actually name the company or ticker.
  const needle = [co.toLowerCase(), ticker.toLowerCase()];
  const direct = dedupe(
    [...yh, ...gn, ...gd]
      .filter((n) => needle.some((k) => n.title.toLowerCase().includes(k) || (n.summary ?? "").toLowerCase().includes(k)))
      .map(tag("direct")),
  ).slice(0, 40);
  const directKeys = new Set(direct.map((d) => d.title.toLowerCase().slice(0, 60)));
  const industryN = dedupe(ind.map(tag("industry")))
    .filter((n) => !directKeys.has(n.title.toLowerCase().slice(0, 60)))
    .slice(0, 15);
  const macro = dedupe(mac.map(tag("macro"))).slice(0, 12);
  return { direct, industry: industryN, macro, queries: { direct: qDirect, industry: qIndustry, macro: qMacro } };
}

// Free-text research for the "challenge" flow: what's being said about the
// company AND the user's point.
export async function researchClaim(ticker: string, name: string | null, keywords: string[]): Promise<NewsItem[]> {
  const co = shortName(name, ticker);
  // Company AND (any of the point's terms) — requiring every word at once
  // returned almost nothing.
  const any = keywords.slice(0, 4).map((k) => (k.includes(" ") ? `"${k}"` : k));
  const orQ = any.length > 1 ? `(${any.join(" OR ")})` : any[0] ?? "";
  const [a, b] = await Promise.all([googleNews(`"${co}" ${orQ} when:30d`, 40), gdelt(`"${co}" ${orQ}`)]);
  return dedupe([...a, ...b].map(tag("direct"))).slice(0, 25);
}
