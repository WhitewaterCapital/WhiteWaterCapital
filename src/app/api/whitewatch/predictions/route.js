import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import conflicts from '../../../../lib/whitewatch-data/conflicts.json';
import { fetchHeadlines } from '../../../../lib/whitewatch-data/intel.mjs';

export const runtime = 'nodejs';
// This route does its own 6h caching (see CACHE below); don't let Next cache
// the response layer on top of it.
export const dynamic = 'force-dynamic';

// Nova runs a deterministic, rules-based signal engine by DEFAULT — it needs no
// API key and costs nothing, so the tab is always live. An optional Claude path
// is kept for anyone who wants LLM narrative later: set PREDICTIONS_ENGINE=claude
// (and ANTHROPIC_API_KEY). If that call fails for any reason we fall back to the
// rules engine rather than showing an empty tab.
const ENGINE = (process.env.PREDICTIONS_ENGINE || 'rules').toLowerCase();
const CLAUDE_MODEL = process.env.PREDICTIONS_MODEL || 'claude-sonnet-5';
const ENGINE_LABEL = 'Whitewatch signal engine';
const HORIZON = '7-day';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — analytical view, not a ticker
let CACHE = { payload: null, at: 0 };

// Distinctive terms per zone so a real headline can be matched to it. Names
// alone miss a lot (a "Red Sea" story rarely says "Red Sea / Bab el-Mandeb"),
// so each zone carries the aliases its coverage actually uses.
const ALIASES = {
  ukraine: ['ukraine', 'russia', 'kyiv', 'moscow', 'kremlin', 'zelensky', 'putin', 'donetsk'],
  gaza: ['gaza', 'israel', 'hamas', 'idf', 'netanyahu', 'palestin', 'rafah'],
  sudan: ['sudan', 'rsf', 'khartoum', 'sudanese', 'darfur'],
  yemen: ['yemen', 'houthi', 'sanaa'],
  'red-sea': ['red sea', 'bab el-mandeb', 'houthi', 'shipping lane', 'commercial vessel', 'tanker attack'],
  hormuz: ['hormuz', 'strait of hormuz', 'tanker', 'iran navy', 'gulf shipping'],
  iran: ['iran', 'tehran', 'irgc', 'nuclear', 'enrichment'],
  lebanon: ['lebanon', 'hezbollah', 'beirut'],
  syria: ['syria', 'damascus', 'syrian'],
  'taiwan-strait': ['taiwan', 'taipei', 'taiwan strait'],
  'south-china-sea': ['south china sea', 'spratly', 'scarborough', 'philippine coast guard'],
  korea: ['north korea', 'pyongyang', 'kim jong', 'dprk', 'south korea'],
  sahel: ['sahel', 'mali', 'niger', 'burkina faso', 'jihadist', 'wagner'],
  drc: ['congo', 'drc', 'm23', 'goma', 'kinshasa', 'rwanda'],
  myanmar: ['myanmar', 'junta', 'burma', 'naypyidaw'],
  somalia: ['somalia', 'al-shabaab', 'mogadishu'],
  afghanistan: ['afghanistan', 'taliban', 'kabul'],
  bosporus: ['bosporus', 'black sea', 'turkey strait', 'turkish strait'],
  suez: ['suez', 'suez canal', 'egypt canal'],
};

function aliasesFor(c) {
  const base = ALIASES[c.id] || [];
  const fromName = c.name.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 3);
  const fromActors = (c.actors || []).flatMap((a) => a.toLowerCase().split(/[^a-z]+/)).filter((t) => t.length > 3);
  return Array.from(new Set([...base, ...fromName, ...fromActors]));
}

// ---------------------------------------------------------------------------
// Rules engine — the decisive, zero-cost default.
// ---------------------------------------------------------------------------

// Directional lexicons. A headline that carries escalation language pushes the
// call up; de-escalation language pushes it down. We never read casualty
// numbers or invent events — only the DIRECTION of real, current coverage.
const ESCALATE = [
  'strike', 'airstrike', 'missile', 'invasion', 'invade', 'offensive', 'assault',
  'killed', 'kills', 'dead', 'casualt', 'shelling', 'bombard', 'drone', 'attack',
  'escalat', 'mobiliz', 'troops', 'incursion', 'breach', 'seizes', 'seized',
  'threaten', 'retaliat', 'clash', 'coup', 'raid', 'siege', 'advance', 'onslaught',
];
const DEESCALATE = [
  'ceasefire', 'cease-fire', 'truce', 'peace', 'withdraw', 'pullback', 'pull back',
  'talks', 'negotiat', 'deal', 'agreement', 'accord', 'diplomacy', 'diplomatic',
  'release', 'prisoner swap', 'de-escalat', 'deescalat', 'restraint', 'pause',
  'aid corridor', 'humanitarian corridor', 'resume', 'summit', 'mediat',
];

const THREAT_WEIGHT = { critical: 2.0, high: 1.5, medium: 1.0, low: 0.6 };

// Zones with a direct, well-understood channel into a tradable market. These
// are never called "irrelevant" — a quiet week at a chokepoint is still a
// standing risk the book carries.
const CHOKEPOINTS = new Set(['red-sea', 'hormuz', 'bosporus', 'suez']);
const MARKET_TAGS = new Set(['oil', 'chokepoint', 'state-on-state', 'nuclear-adjacent', 'shipping', 'energy']);

// Concrete assets each zone actually moves (kept <= 14 words each).
const MARKETS = {
  ukraine: 'EU natgas (TTF), wheat, defense primes (RTX, LMT)',
  gaza: 'Brent risk premium, regional equities, defense',
  sudan: 'Gold, aid flows; limited direct market impact',
  yemen: 'Brent, Red Sea tanker & container rates',
  'red-sea': 'Container/tanker rates, Brent, Suez transit volumes',
  hormuz: 'Brent, WTI, tanker rates, Gulf risk premium',
  iran: 'Brent, oil risk premium, defense primes',
  lebanon: 'Brent risk premium, regional risk sentiment',
  syria: 'Regional oil risk premium, refugee-linked risk',
  'taiwan-strait': 'Semis (TSMC), tech supply chain, defense',
  'south-china-sea': 'Shipping lanes, semis, regional equities',
  korea: 'KOSPI, defense primes, safe-haven flows',
  sahel: 'Uranium, gold, regional resource risk',
  drc: 'Cobalt, copper, tantalum supply',
  myanmar: 'Rare earths, regional risk; limited channel',
  somalia: 'Gulf of Aden shipping, Brent',
  afghanistan: 'Limited direct market channel this horizon',
  bosporus: 'Black Sea grain/wheat, tanker flows',
  suez: 'Container/tanker rates, Brent, global trade flows',
};

function marketFor(c) {
  if (MARKETS[c.id]) return MARKETS[c.id];
  if ((c.region || '').includes('Middle East')) return 'Brent, regional risk premium';
  return 'Regional risk premium; limited direct market impact';
}

function isMarketRelevant(c) {
  if (CHOKEPOINTS.has(c.id)) return true;
  if ((c.tags || []).some((t) => MARKET_TAGS.has(t))) return true;
  return c.threat === 'critical' || c.threat === 'high';
}

// Net directional pressure from the matched headlines. One vote per headline
// (escalatory / de-escalatory), scaled by that headline's own threat tag.
function scoreHeadlines(hits) {
  let net = 0;
  let escN = 0;
  let deescN = 0;
  for (const h of hits) {
    const t = (h.title || '').toLowerCase();
    const esc = ESCALATE.some((k) => t.includes(k));
    const deesc = DEESCALATE.some((k) => t.includes(k));
    if (!esc && !deesc) continue;
    const w = THREAT_WEIGHT[h.threat] ?? 1.0;
    if (esc) { net += w; escN += 1; }
    if (deesc) { net -= w; deescN += 1; }
  }
  return { net, escN, deescN };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

function watchFor(call) {
  switch (call) {
    case 'escalating': return 'A credible ceasefire, withdrawal, or negotiated pause.';
    case 'de-escalating': return 'Renewed strikes, a broken truce, or fresh mobilization.';
    case 'irrelevant': return 'Any spillover into oil, shipping, or a major-power actor.';
    default: return 'A major strike, or a ceasefire/talks breakthrough.';
  }
}

// Build a decisive call for one zone from real evidence + base rates. No
// fabricated events — only the direction of current coverage and the standing
// situation from the curated dataset.
function callZone(c, hits) {
  const count = hits.length;
  const status = (c.status || 'the current situation').toLowerCase();
  const { net, escN, deescN } = scoreHeadlines(hits);

  // No fresh matching headline — reason from base rates, keep conviction modest.
  if (count === 0 || (escN === 0 && deescN === 0)) {
    if (c.threat === 'critical') {
      return {
        call: 'escalating', conviction: 50,
        thesis: `Escalating — no fresh catalyst this week, but an active ${c.threat} conflict; base rate favors continued pressure.`,
        watch: watchFor('escalating'), market: marketFor(c),
      };
    }
    if (c.threat === 'high' || isMarketRelevant(c)) {
      return {
        call: 'stable', conviction: 52,
        thesis: `Stable — no fresh catalyst; ${status} holds at ${c.threat} threat over the 7-day horizon.`,
        watch: watchFor('stable'), market: marketFor(c),
      };
    }
    return {
      call: 'irrelevant', conviction: 50,
      thesis: 'Not market-moving this week — no fresh catalyst and no direct channel to tradable assets in the horizon.',
      watch: watchFor('irrelevant'), market: marketFor(c),
    };
  }

  // Evidence present — direction from net pressure.
  let call;
  if (net >= 1.5) call = 'escalating';
  else if (net <= -1.5) call = 'de-escalating';
  else call = 'stable';

  const mag = Math.min(Math.abs(net), 6);
  let conviction;
  let thesis;
  if (call === 'stable') {
    conviction = clamp(58 + Math.min(count, 6) * 1.5, 50, 72);
    thesis = `Stable — mixed signals across ${count} recent ${count === 1 ? 'headline' : 'headlines'} net roughly flat; ${status} continues at ${c.threat} threat.`;
  } else if (call === 'escalating') {
    conviction = clamp(54 + mag * 5 + Math.min(count, 6), 50, 92);
    thesis = `Escalating — ${count} recent ${count === 1 ? 'headline' : 'headlines'} lean toward strikes/offensive moves, outweighing de-escalation signals; ${c.threat} baseline.`;
  } else {
    conviction = clamp(54 + mag * 5 + Math.min(count, 6), 50, 92);
    thesis = `De-escalating — recent headlines carry ceasefire/withdrawal/talks language, easing the ${c.threat} baseline over the horizon.`;
  }

  return { call, conviction, thesis, watch: watchFor(call), market: marketFor(c) };
}

// ---------------------------------------------------------------------------
// Optional Claude path (opt-in via PREDICTIONS_ENGINE=claude). Kept intact but
// off by default so the desk never depends on paid API credits.
// ---------------------------------------------------------------------------

async function macroContext() {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'aurora', 'latest.json');
    const raw = await fs.readFile(p, 'utf8');
    const j = JSON.parse(raw);
    const regime = j?.regime?.label || j?.regime?.name || null;
    return regime ? `Current macro regime (Aurora): ${regime}.` : null;
  } catch {
    return null;
  }
}

async function callClaude(system, userContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      temperature: 0.4,
      system,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '[' },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  return '[' + (data.content?.[0]?.text || '');
}

function parseZones(raw) {
  const end = raw.lastIndexOf(']');
  const slice = end === -1 ? raw : raw.slice(0, end + 1);
  const arr = JSON.parse(slice);
  if (!Array.isArray(arr)) throw new Error('not an array');
  return arr;
}

const CALLS = new Set(['escalating', 'stable', 'de-escalating', 'irrelevant']);

function normalizeClaudeZone(modelObj, meta) {
  const call = CALLS.has(modelObj?.call) ? modelObj.call : 'stable';
  let conviction = Number(modelObj?.conviction);
  if (!Number.isFinite(conviction)) conviction = 55;
  conviction = clamp(conviction, 0, 100);
  return {
    id: meta.id, name: meta.name, region: meta.region, threat: meta.threat,
    lat: meta.lat, lng: meta.lng,
    call, conviction,
    thesis: (modelObj?.thesis || '').toString().trim() || null,
    watch: (modelObj?.watch || '').toString().trim() || null,
    market: (modelObj?.market || '').toString().trim() || null,
    evidenceCount: meta._evidenceCount,
  };
}

async function claudeZones(byZone, macro) {
  const zonesForPrompt = conflicts.map((c) => {
    const hits = (byZone.get(c.id) || []).slice(0, 6).map((h) => `- ${h.title} (${h.source})`);
    return {
      id: c.id, name: c.name, threat: c.threat, situation: c.summary, actors: c.actors,
      recent_headlines: hits.length ? hits : ['(no fresh matching headline in the last 48h)'],
    };
  });
  const system = [
    'You are Nova, the geopolitical desk for Whitewater, a small investment club.',
    'Make an ACTUAL directional call on every conflict zone for a 7-day horizon.',
    '1. Every zone: exactly one of "escalating", "stable", "de-escalating". "stable" is a real call, not a dodge.',
    '2. Use "irrelevant" ONLY when the zone will not move any tradable market in 7 days. Chokepoints/oil are rarely irrelevant.',
    '3. Never hedge with "unclear" or "insufficient evidence". Commit.',
    '4. Ground the call in recent_headlines when present; otherwise reason from the standing situation and keep conviction modest.',
    '5. NEVER invent events, casualty numbers, or dates.',
    '6. conviction (0-100) = how strongly evidence + base rates support the DIRECTION.',
    macro || '',
    '',
    'Return ONLY a JSON array, one object per zone in order:',
    '{"id": <zone id>, "call": "escalating|stable|de-escalating|irrelevant", "conviction": <int>, "thesis": <<=24 words>, "watch": <<=14 words>, "market": <<=14 words>}',
  ].join('\n');
  const raw = await callClaude(system, `Zones:\n${JSON.stringify(zonesForPrompt, null, 2)}`);
  const byId = new Map(parseZones(raw).map((o) => [o.id, o]));
  return conflicts.map((c) => {
    const meta = { ...c, _evidenceCount: (byZone.get(c.id) || []).length };
    const obj = byId.get(c.id);
    return obj ? normalizeClaudeZone(obj, meta) : {
      id: c.id, name: c.name, region: c.region, threat: c.threat, lat: c.lat, lng: c.lng,
      call: null, conviction: null, thesis: null, watch: null, market: null, evidenceCount: meta._evidenceCount,
    };
  });
}

// ---------------------------------------------------------------------------

export async function GET(request) {
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';

  if (!refresh && CACHE.payload && Date.now() - CACHE.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...CACHE.payload, cached: true });
  }

  // Evidence: real, current headlines. Best-effort — if the feeds are down we
  // still produce base-rate calls (never an empty tab).
  let headlines = [];
  let evidenceNote = null;
  try {
    headlines = await fetchHeadlines();
  } catch (err) {
    console.error('Predictions evidence fetch failed:', err.message);
    evidenceNote = 'Live headline feeds are temporarily unavailable — calls reflect standing situations and base rates.';
  }

  // Match headlines to zones once; both engines reuse this.
  const byZone = new Map();
  for (const c of conflicts) {
    const al = aliasesFor(c);
    const hits = headlines.filter((h) => {
      const t = (h.title || '').toLowerCase();
      return al.some((a) => t.includes(a));
    });
    byZone.set(c.id, hits);
  }

  let zones;
  let usedEngine = ENGINE_LABEL;
  let engineNote = evidenceNote;

  if (ENGINE === 'claude' && process.env.ANTHROPIC_API_KEY) {
    try {
      const macro = await macroContext();
      zones = await claudeZones(byZone, macro);
      usedEngine = CLAUDE_MODEL;
    } catch (err) {
      console.error('Claude predictions failed, falling back to rules engine:', err.message);
      engineNote = 'LLM path unavailable — showing the rules-based signal engine.';
    }
  }

  if (!zones) {
    zones = conflicts.map((c) => {
      const hits = byZone.get(c.id) || [];
      const r = callZone(c, hits);
      return {
        id: c.id, name: c.name, region: c.region, threat: c.threat, lat: c.lat, lng: c.lng,
        call: r.call, conviction: r.conviction, thesis: r.thesis, watch: r.watch, market: r.market,
        evidenceCount: hits.length,
      };
    });
  }

  const payload = {
    live: true,
    engine: usedEngine === CLAUDE_MODEL ? 'claude' : 'rules',
    model: usedEngine,
    horizon: HORIZON,
    generatedAt: new Date().toISOString(),
    evidenceAsOf: new Date().toISOString(),
    evidenceCount: headlines.length,
    note: engineNote || undefined,
    zones,
  };
  CACHE = { payload, at: Date.now() };
  return NextResponse.json(payload);
}
