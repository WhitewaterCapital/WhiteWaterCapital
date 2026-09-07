// Live-intel evidence source for the Nova predictions engine.
//
// This is the EVIDENCE layer. It pulls recent, real headlines (keyless GDELT
// + a few public RSS feeds) so the model reasons over what is actually
// happening this week, not a static snapshot. It never republishes article
// bodies — only headline + source + timestamp, which the model treats as
// signal. Same region/threat heuristics as /api/whitewatch/news so tagging
// is consistent across the desk.

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 6000,
  headers: { 'User-Agent': 'Mozilla/5.0 (WhitewatchIntelBot/1.0)' },
});

const REGION_KEYWORDS = {
  'Middle East': ['israel', 'gaza', 'palestin', 'iran', 'lebanon', 'syria', 'yemen', 'iraq', 'saudi', 'hormuz', 'red sea', 'hezbollah', 'houthi'],
  Europe: ['ukraine', 'russia', 'nato', 'poland', 'european union', 'moscow', 'kyiv', 'kremlin', 'bosporus'],
  'East Asia': ['china', 'taiwan', 'korea', 'japan', 'beijing', 'pyongyang', 'south china sea'],
  'South Asia': ['india', 'pakistan', 'afghanistan', 'bangladesh', 'nepal'],
  Africa: ['sudan', 'congo', 'mali', 'niger', 'somalia', 'nigeria', 'ethiopia', 'sahel', 'burkina'],
  Americas: ['united states', 'u.s.', 'mexico', 'brazil', 'venezuela', 'colombia'],
  'Southeast Asia': ['myanmar', 'philippines', 'vietnam', 'indonesia'],
};

function classifyRegion(text) {
  const lower = text.toLowerCase();
  for (const [region, kws] of Object.entries(REGION_KEYWORDS)) {
    if (kws.some((kw) => lower.includes(kw))) return region;
  }
  return 'Global';
}

const THREAT_KEYWORDS = {
  critical: ['killed', 'strike', 'invasion', 'airstrike', 'missile attack', 'dead', 'offensive', 'nuclear', 'massacre'],
  high: ['attack', 'clash', 'troops', 'military', 'conflict', 'war', 'ceasefire', 'sanctions', 'drone'],
  medium: ['tension', 'warns', 'deploy', 'border', 'talks', 'protest', 'negotiat'],
};

function classifyThreat(text) {
  const lower = text.toLowerCase();
  for (const level of ['critical', 'high', 'medium']) {
    if (THREAT_KEYWORDS[level].some((kw) => lower.includes(kw))) return level;
  }
  return 'low';
}

const FEEDS = [
  'http://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://news.google.com/rss/search?q=site:reuters.com+world&hl=en-US&gl=US&ceid=US:en',
];

const GDELT_QUERY = '(war OR conflict OR military OR sanctions OR coup OR ceasefire OR strike OR invasion OR airstrike OR unrest) sourcelang:eng';
const GDELT_URL = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(GDELT_QUERY)}&mode=artlist&format=json&maxrecords=75&sort=datedesc&timespan=2d`;

function parseGdeltDate(seendate) {
  if (!seendate || seendate.length < 15) return null;
  const iso = `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}T${seendate.slice(9, 11)}:${seendate.slice(11, 13)}:${seendate.slice(13, 15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchGdelt() {
  const resp = await fetch(GDELT_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (WhitewatchIntelBot/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`GDELT ${resp.status}`);
  const json = await resp.json();
  return (json?.articles || [])
    .map((a) => ({
      title: a.title,
      source: a.domain || 'web',
      region: classifyRegion(a.title || ''),
      threat: classifyThreat(a.title || ''),
      publishedAt: parseGdeltDate(a.seendate),
    }))
    .filter((i) => i.title);
}

async function fetchRss() {
  const settled = await Promise.allSettled(
    FEEDS.map(async (url) => {
      const parsed = await parser.parseURL(url);
      return (parsed.items || []).slice(0, 20).map((item) => {
        const text = `${item.title || ''} ${item.contentSnippet || ''}`;
        return {
          title: item.title,
          source: parsed.title || 'RSS',
          region: classifyRegion(text),
          threat: classifyThreat(text),
          publishedAt: item.isoDate || item.pubDate || null,
        };
      });
    }),
  );
  return settled.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value).filter((i) => i.title);
}

// Returns a deduped, date-sorted list of recent real headlines with region +
// threat tags. Best-effort: if a source is down it's skipped, never fatal.
export async function fetchHeadlines() {
  const [gdelt, rss] = await Promise.all([
    fetchGdelt().catch((e) => { console.error('GDELT evidence failed:', e.message); return []; }),
    fetchRss().catch((e) => { console.error('RSS evidence failed:', e.message); return []; }),
  ]);
  const all = [...gdelt, ...rss].filter((i) => i.title && i.title.length > 8);
  const seen = new Set();
  const deduped = [];
  for (const item of all.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))) {
    const key = item.title.trim().toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}
