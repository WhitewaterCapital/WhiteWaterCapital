import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import conflicts from '../../../../lib/whitewatch-data/conflicts.json';
import { fetchHeadlines } from '../../../../lib/whitewatch-data/intel.mjs';

export const runtime = 'nodejs';
// This route does its own 6h caching (see CACHE below); don't let Next cache
// the response layer on top of it.
export const dynamic = 'force-dynamic';

const MODEL = process.env.PREDICTIONS_MODEL || 'claude-sonnet-5';
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

// Read the current macro regime (if Aurora has exported one) so the model's
// market-impact reads are consistent with the desk's macro lens. Optional —
// absent file is fine.
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
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.4,
      system,
      messages: [
        { role: 'user', content: userContent },
        // Prefill forces the reply to start as a JSON array — no preamble to strip.
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
  // The model was prefilled with '[', so raw is a JSON array — but trim any
  // trailing prose after the closing bracket just in case.
  const end = raw.lastIndexOf(']');
  const slice = end === -1 ? raw : raw.slice(0, end + 1);
  const arr = JSON.parse(slice);
  if (!Array.isArray(arr)) throw new Error('not an array');
  return arr;
}

const CALLS = new Set(['escalating', 'stable', 'de-escalating', 'irrelevant']);

function normalizeZone(modelObj, meta) {
  const call = CALLS.has(modelObj?.call) ? modelObj.call : 'stable';
  let conviction = Number(modelObj?.conviction);
  if (!Number.isFinite(conviction)) conviction = 55;
  conviction = Math.max(0, Math.min(100, Math.round(conviction)));
  return {
    id: meta.id,
    name: meta.name,
    region: meta.region,
    threat: meta.threat,
    lat: meta.lat,
    lng: meta.lng,
    call,
    conviction,
    thesis: (modelObj?.thesis || '').toString().trim() || null,
    watch: (modelObj?.watch || '').toString().trim() || null,
    market: (modelObj?.market || '').toString().trim() || null,
    evidenceCount: meta._evidenceCount,
  };
}

// Turn a raw provider error into a clean, human note. Keeps the ugly JSON /
// request_id out of the members UI; the full error still goes to server logs.
function friendlyError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('credit balance') || m.includes('billing')) {
    return 'Anthropic API has no credits — add credits at console.anthropic.com → Plans & Billing (the API is billed separately from a Claude subscription). Live calls resume automatically once funded.';
  }
  if (m.includes('401') || m.includes('authentication') || m.includes('invalid x-api-key')) {
    return 'Anthropic API key rejected — check ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.';
  }
  if (m.includes('429') || m.includes('rate')) {
    return 'Anthropic API rate limit hit — showing zones without a call; live analysis will refresh shortly.';
  }
  if (m.includes('not_found') || m.includes('404') || m.includes('model')) {
    return 'Prediction model unavailable on this account — set PREDICTIONS_MODEL to a model you have access to, then redeploy.';
  }
  return 'Live prediction call failed — showing zones without a call. See server logs for details.';
}

function degraded(note) {
  return NextResponse.json({
    live: false,
    note,
    horizon: HORIZON,
    generatedAt: new Date().toISOString(),
    zones: conflicts.map((c) => ({
      id: c.id, name: c.name, region: c.region, threat: c.threat,
      lat: c.lat, lng: c.lng,
      call: null, conviction: null, thesis: null, watch: null, market: null, evidenceCount: 0,
    })),
  });
}

export async function GET(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';

  if (!apiKey) {
    return degraded('ANTHROPIC_API_KEY not set — add it in Vercel → Settings → Environment Variables and redeploy to enable live calls.');
  }

  // Serve cached analysis unless expired or explicitly refreshed.
  if (!refresh && CACHE.payload && Date.now() - CACHE.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...CACHE.payload, cached: true });
  }

  try {
    const [headlines, macro] = await Promise.all([fetchHeadlines(), macroContext()]);
    const evidenceAsOf = new Date().toISOString();

    // Attach the most relevant recent headlines to each zone.
    const zonesForPrompt = conflicts.map((c) => {
      const al = aliasesFor(c);
      const hits = headlines
        .filter((h) => {
          const t = h.title.toLowerCase();
          return al.some((a) => t.includes(a));
        })
        .slice(0, 6)
        .map((h) => `- ${h.title} (${h.source})`);
      c._evidenceCount = hits.length;
      return {
        id: c.id,
        name: c.name,
        threat: c.threat,
        situation: c.summary,
        actors: c.actors,
        recent_headlines: hits.length ? hits : ['(no fresh matching headline in the last 48h)'],
      };
    });

    const system = [
      'You are Nova, the geopolitical desk for Whitewater, a small investment club.',
      'Your job is to make an ACTUAL directional call on every conflict zone for a 7-day horizon — calls the team can trade around.',
      'Rules:',
      '1. For every zone choose exactly one call: "escalating", "stable", or "de-escalating". "stable" means the trajectory genuinely holds — it is a real call, NOT a way to avoid deciding.',
      '2. Use "irrelevant" ONLY when the zone will not move any tradable market in the next 7 days. Do not overuse it. Chokepoints and oil/defense-linked zones are rarely irrelevant.',
      '3. Never hedge with "unclear", "monitoring", or "insufficient evidence". Commit.',
      '4. Ground the call in the provided recent_headlines when present. When none are present, reason from the standing situation and base rates, and keep conviction modest.',
      '5. NEVER invent specific events, casualty numbers, or dates. Be decisive about the interpretation of real signals, not by fabricating facts.',
      '6. conviction (0-100) = how strongly evidence + base rates support the DIRECTION you chose.',
      macro || '',
      '',
      'Return ONLY a JSON array. One object per zone, in the same order given:',
      '{"id": <zone id>, "call": "escalating|stable|de-escalating|irrelevant", "conviction": <int 0-100>, "thesis": <<=24 words: the call and its main driver>, "watch": <<=14 words: the one signal that would flip the call>, "market": <<=14 words: concrete assets/sectors that move, e.g. "Brent, EU gas, defense primes">}',
      'No markdown, no commentary outside the array.',
    ].join('\n');

    const userContent = `Zones:\n${JSON.stringify(zonesForPrompt, null, 2)}`;

    const raw = await callClaude(system, userContent);
    const parsed = parseZones(raw);
    const byId = new Map(parsed.map((o) => [o.id, o]));

    const zones = conflicts.map((c) => {
      const meta = { ...c, _evidenceCount: c._evidenceCount || 0 };
      const modelObj = byId.get(c.id);
      if (!modelObj) {
        return { id: c.id, name: c.name, region: c.region, threat: c.threat, lat: c.lat, lng: c.lng,
          call: null, conviction: null, thesis: null, watch: null, market: null, evidenceCount: meta._evidenceCount };
      }
      return normalizeZone(modelObj, meta);
    });

    const payload = {
      live: true,
      model: MODEL,
      horizon: HORIZON,
      generatedAt: new Date().toISOString(),
      evidenceAsOf,
      evidenceCount: headlines.length,
      zones,
    };
    CACHE = { payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Predictions error:', err.message);
    // If we have a previous good analysis, serve it stale rather than nothing.
    if (CACHE.payload) {
      return NextResponse.json({ ...CACHE.payload, cached: true, stale: true, error: err.message });
    }
    return degraded(friendlyError(err.message));
  }
}
