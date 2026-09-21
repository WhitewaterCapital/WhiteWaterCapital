import type {
  Member,
  Contribution,
  Snapshot,
  Position,
  Proposal,
  Trade,
} from "./types";

// ---------------------------------------------------------------------------
// Sample data. This is what the app renders until a real broker + DB are wired
// in. Everything here comes from ONE deterministic simulation so the numbers
// reconcile: contributions flow into the pool, performance is measured on unit
// value (contribution-neutral), and the dashboard, public page, and members
// page all agree.
// ---------------------------------------------------------------------------

export const members: Member[] = [
  { id: "m_james", name: "James", email: "james@example.com", role: "admin", joinedAt: "2026-01-31" },
  { id: "m_alan", name: "Alan", email: "alan@example.com", role: "member", joinedAt: "2026-01-31" },
  { id: "m_jt", name: "JT", email: "jt@example.com", role: "member", joinedAt: "2026-01-31" },
  { id: "m_sam", name: "Sam", email: "sam@example.com", role: "member", joinedAt: "2026-01-31" },
  { id: "m_dana", name: "Dana", email: "dana@example.com", role: "member", joinedAt: "2026-03-14" },
];

// Deterministic PRNG (mulberry32) so charts are stable across reloads.
function makeRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deposits that happen during the simulation, by week index. Units are issued
// at the unit value on that week (computed in the sim, not hardcoded).
const DEPOSITS: {
  week: number;
  memberId: string;
  amountUsd: number;
  note: string;
}[] = [
  { week: 0, memberId: "m_james", amountUsd: 6000, note: "Seed" },
  { week: 0, memberId: "m_alan", amountUsd: 5000, note: "Seed" },
  { week: 0, memberId: "m_jt", amountUsd: 4000, note: "Seed" },
  { week: 0, memberId: "m_sam", amountUsd: 5000, note: "Seed" },
  { week: 6, memberId: "m_dana", amountUsd: 4000, note: "Joined" },
  { week: 14, memberId: "m_james", amountUsd: 1000, note: "Top-up" },
];

const STARTING_UNIT_VALUE = 10;

function simulate() {
  const rng = makeRng(20260131);
  const start = new Date("2026-01-31T00:00:00Z");
  const weeks = 26;

  let unitValue = STARTING_UNIT_VALUE; // grows only with market performance
  let units = 0; // total units outstanding (grows with deposits)
  let spy = 560;

  const snaps: Snapshot[] = [];
  const contributions: Contribution[] = [];
  let cId = 1;

  for (let w = 0; w <= weeks; w++) {
    const d = new Date(start.getTime() + w * 7 * 24 * 3600 * 1000);

    // Market moves the unit value (not deposits). ~0.25%/wk drift + noise.
    if (w > 0) {
      const pRet = 0.0025 + (rng() - 0.5) * 0.022;
      const sRet = 0.0015 + (rng() - 0.5) * 0.018;
      unitValue *= 1 + pRet;
      spy *= 1 + sRet;
    }

    // Any deposits this week buy units at the current unit value.
    for (const dep of DEPOSITS.filter((x) => x.week === w)) {
      const issued = dep.amountUsd / unitValue;
      units += issued;
      contributions.push({
        id: `c${cId++}`,
        memberId: dep.memberId,
        date: d.toISOString().slice(0, 10),
        amountUsd: dep.amountUsd,
        unitsIssued: Math.round(issued * 100) / 100,
        note: dep.note,
      });
    }

    const totalValue = units * unitValue;
    const invested = totalValue * (0.6 + rng() * 0.3); // 60–90% invested
    snaps.push({
      date: d.toISOString().slice(0, 10),
      totalValueUsd: Math.round(totalValue),
      cashUsd: Math.round(totalValue - invested),
      investedUsd: Math.round(invested),
      unitValueUsd: Math.round(unitValue * 1000) / 1000,
      spyPrice: Math.round(spy * 100) / 100,
    });
  }

  return { snaps, contributions };
}

const sim = simulate();

export const snapshots: Snapshot[] = sim.snaps;
export const contributions: Contribution[] = sim.contributions;

export const positions: Position[] = [
  { symbol: "NVDA", quantity: 36, avgCostUsd: 118.4, lastPriceUsd: 141.2, marketValueUsd: 5083.2, unrealizedPnlUsd: 820.8, openedAt: "2026-03-02" },
  { symbol: "MSFT", quantity: 12, avgCostUsd: 402.1, lastPriceUsd: 438.9, marketValueUsd: 5266.8, unrealizedPnlUsd: 441.6, openedAt: "2026-02-20" },
  { symbol: "COST", quantity: 6, avgCostUsd: 872.0, lastPriceUsd: 905.3, marketValueUsd: 5431.8, unrealizedPnlUsd: 199.8, openedAt: "2026-04-11" },
  { symbol: "AMD", quantity: 27, avgCostUsd: 154.7, lastPriceUsd: 149.1, marketValueUsd: 4025.7, unrealizedPnlUsd: -151.2, openedAt: "2026-05-01" },
];

export const proposals: Proposal[] = [
  {
    id: "p1",
    symbol: "GOOGL",
    side: "buy",
    targetUsd: 1500,
    thesis: "Cloud growth reaccelerating and Gemini traction; trading below peers on forward earnings. Entry on the recent pullback.",
    proposedBy: "m_alan",
    createdAt: "2026-07-28T15:04:00Z",
    status: "open",
    votes: [
      { memberId: "m_alan", value: "yes", at: "2026-07-28T15:04:00Z" },
      { memberId: "m_james", value: "yes", at: "2026-07-28T18:20:00Z" },
    ],
  },
  {
    id: "p2",
    symbol: "AMD",
    side: "sell",
    targetUsd: 1341,
    thesis: "Thesis broke — losing share in the segment we bought it for. Cut the loss and redeploy.",
    proposedBy: "m_jt",
    createdAt: "2026-07-30T13:10:00Z",
    status: "open",
    votes: [{ memberId: "m_jt", value: "yes", at: "2026-07-30T13:10:00Z" }],
  },
];

export const trades: Trade[] = [
  { id: "t1", symbol: "MSFT", side: "buy", quantity: 4, priceUsd: 402.1, executedAt: "2026-02-20T14:35:00Z" },
  { id: "t2", symbol: "NVDA", side: "buy", quantity: 12, priceUsd: 118.4, executedAt: "2026-03-02T15:02:00Z" },
  { id: "t3", symbol: "COST", side: "buy", quantity: 2, priceUsd: 872.0, executedAt: "2026-04-11T16:11:00Z" },
  { id: "t4", symbol: "AMD", side: "buy", quantity: 9, priceUsd: 154.7, executedAt: "2026-05-01T14:20:00Z" },
];

// ===========================================================================
// Per-strategy attribution + v1.0 performance disclosures (ported from the
// website-3 build for the /performance page — IMP-01). Additive, illustrative
// sample data grounded in the existing snapshot sim; no real per-strategy
// ledger exists. Depends only on makeRng + snapshots already defined above.
// ===========================================================================
export type StrategyKind = "discretionary" | "model-driven" | "paper";

export type StrategyMeta = {
  id: string;
  name: string;
  kind: StrategyKind;
  description: string;
};

export const strategies: StrategyMeta[] = [
  {
    id: "core",
    name: "Core conviction picks",
    kind: "discretionary",
    description: "The four-rule concentrated book members vote on — the same account tracked elsewhere on the desk.",
  },
  {
    id: "signals",
    name: "Incepta + Aurora signals",
    kind: "model-driven",
    description: "Sized off the equity + macro engines' output; not yet a capital-segregated sleeve.",
  },
  {
    id: "paper-weekly",
    name: "WW-WEEKLY rank (paper)",
    kind: "paper",
    description: "Tracked in a paper book only — no real capital committed while it accrues a live track record.",
  },
];

export type StrategyAttributionPoint = {
  date: string; // ISO date, aligned with `snapshots`
  weight: Record<string, number>; // strategy id -> fraction of the book that week (paper is always 0 — it carries no real capital by definition)
  contributionPct: Record<string, number>; // strategy id -> contribution to that week's return, in percentage points
};

export const strategyAttribution: StrategyAttributionPoint[] = (() => {
  // A different seed from the account sim above: this is an independent
  // illustrative split, not derived from any real per-trade record.
  const rng = makeRng(20260201);
  return snapshots.map((s, i) => {
    if (i === 0) {
      return {
        date: s.date,
        weight: { core: 0.6, signals: 0.25, "paper-weekly": 0 },
        contributionPct: { core: 0, signals: 0, "paper-weekly": 0 },
      };
    }
    const weekReturnPct = (s.unitValueUsd / snapshots[i - 1].unitValueUsd - 1) * 100;
    // Split the week's real blended return across the two capital-bearing
    // sleeves with a small persistent tilt + noise; paper gets its own
    // shadow return that never touches the real blended number.
    const coreShare = 0.55 + (rng() - 0.5) * 0.25;
    const signalsShare = 1 - coreShare;
    const paperShadowPct = weekReturnPct * (0.6 + rng() * 0.8) + (rng() - 0.5) * 0.4;
    return {
      date: s.date,
      weight: {
        core: Math.round((0.55 + (rng() - 0.5) * 0.1) * 100) / 100,
        signals: Math.round((0.28 + (rng() - 0.5) * 0.08) * 100) / 100,
        "paper-weekly": 0,
      },
      contributionPct: {
        core: Math.round(weekReturnPct * coreShare * 100) / 100,
        signals: Math.round(weekReturnPct * signalsShare * 100) / 100,
        "paper-weekly": Math.round(paperShadowPct * 100) / 100,
      },
    };
  });
})();

// ---------------------------------------------------------------------------
// IMP-01 — v1.0 performance disclosures. Every value is grounded in facts
// already true of this sample simulation (inception = the sim's own start
// date, benchmark = the SPY series already carried on every Snapshot,
// valuation cadence = the sim's own weekly step, cash-flow treatment =
// src/lib/units.ts's unit accounting) — nothing here is invented for this page.
// ---------------------------------------------------------------------------
export const performanceDisclosures = {
  inceptionDate: snapshots[0]?.date ?? "—",
  benchmark: "S&P 500 (tracked via SPY close — see Snapshot.spyPrice)",
  feeTreatment:
    "Returns shown are GROSS — this simulation has no management or performance fee schedule implemented.",
  cashFlowTreatment:
    "Unit accounting (src/lib/units.ts): every deposit/withdrawal buys or redeems units at that day's unit value, so cash-flow timing never dilutes or inflates another member's return.",
  valuationTiming: "Valued weekly, as of each snapshot's date — this sample simulation's own cadence.",
  dataSource:
    "Illustrative synthetic sample data (src/lib/sample-data.ts) — no live broker feed or real multi-strategy ledger is connected in this environment.",
};


// ===========================================================================
// Club toolkit — Watchlist + Decision Journal (in-app, sample data).
// The Journal closes the loop the club's ethos asks for: every position and
// past decision carries the written thesis it started as, who championed it,
// and — once closed — an honest "how it aged" review. Open entries double as
// the "why we own this" for each current holding. Swap for a real store when
// proposals/trades persist to a database.
// ===========================================================================

export type WatchItem = {
  symbol: string;
  addedBy: string; // member name
  addedAt: string; // ISO date
  note: string; // plain-language reason we're watching it
};

export const watchlist: WatchItem[] = [
  { symbol: "GOOGL", addedBy: "James", addedAt: "2026-08-18", note: "Cheap on our numbers and cloud is re-accelerating — there's an open proposal to start a position." },
  { symbol: "TSM", addedBy: "Alan", addedAt: "2026-08-30", note: "The picks-and-shovels way to own the AI buildout; waiting for a better entry after the recent run." },
  { symbol: "PANW", addedBy: "Dana", addedAt: "2026-09-05", note: "Security spend keeps compounding; want to see one more clean quarter before we commit." },
  { symbol: "V", addedBy: "JT", addedAt: "2026-09-09", note: "A quality compounder for ballast — on the list if we want to de-risk the book." },
];

export type JournalAction = "buy" | "add" | "trim" | "sell";
export type JournalEntry = {
  id: string;
  symbol: string;
  action: JournalAction;
  date: string; // ISO date the decision was made
  championedBy: string; // member name
  thesis: string; // the written argument at the time
  status: "open" | "closed";
  review: string; // open: the current read; closed: how it actually aged
};

export const journal: JournalEntry[] = [
  // Open — these are the "why we own this" for the current holdings.
  { id: "j_nvda", symbol: "NVDA", action: "buy", date: "2026-03-02", championedBy: "James",
    thesis: "Accelerated-compute demand is supply-constrained, not demand-constrained — we want the toll-taker on the whole AI buildout.",
    status: "open", review: "Working: up ~$820. Thesis intact while data-center orders keep outrunning supply." },
  { id: "j_msft", symbol: "MSFT", action: "buy", date: "2026-02-20", championedBy: "Sam",
    thesis: "Copilot attach + Azure re-acceleration turns AI capex into durable, high-margin recurring revenue.",
    status: "open", review: "Working: up ~$440. Watching cloud growth and capex discipline at the next print." },
  { id: "j_cost", symbol: "COST", action: "buy", date: "2026-04-11", championedBy: "Dana",
    thesis: "Membership model is a recession-resistant compounder — steady, and it balances our tech-heavy book.",
    status: "open", review: "Working: up ~$200. Doing its job as the defensive anchor." },
  { id: "j_amd", symbol: "AMD", action: "buy", date: "2026-05-01", championedBy: "Alan",
    thesis: "The credible #2 in AI accelerators; MI-series share gains give a second horse in the same race as NVDA.",
    status: "open", review: "Under pressure: down ~$150. If MI-series share gains don't show next print, the thesis is on the clock." },
  // Closed — the loop working: a decision made, then honestly reviewed.
  { id: "j_meta", symbol: "META", action: "sell", date: "2026-06-20", championedBy: "James",
    thesis: "Sold into strength after the position doubled — valuation ran ahead of the growth we underwrote.",
    status: "closed", review: "Good discipline: locked a clean win. It kept drifting up ~5% after we sold, but selling a doubled thesis-complete position was the right call, not a miss." },
  { id: "j_pfe", symbol: "PFE", action: "sell", date: "2026-05-12", championedBy: "JT",
    thesis: "Thesis broke — the pipeline catalyst we bought for slipped a year and the setup no longer held.",
    status: "closed", review: "Correct exit for the wrong-feeling reason: cutting a broken thesis fast saved us from the further leg down that followed. A reminder that 'the thesis broke, so it goes' works." },
];
