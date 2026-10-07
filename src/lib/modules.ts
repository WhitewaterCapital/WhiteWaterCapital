// ---------------------------------------------------------------------------
// The members area's map — one list used by the Desk launcher, the module
// menu in every members page header, the auth proxy and robots.txt.
// Add a module here and it shows up everywhere (and is protected).
// ---------------------------------------------------------------------------

export type ModuleLink = {
  href: string;
  name: string;
  latin: string;
  blurb: string;
};

export const MODULES: ModuleLink[] = [
  { href: "/sentiment", name: "Sentimentum", latin: "the regime lens", blurb: "Top-down macro and cross-sector read." },
  { href: "/stress-test", name: "Strictus Testum", latin: "the rigorous test", blurb: "Pressure-test a trade — the adversarial read." },
  { href: "/war-map", name: "Nova", latin: "new things", blurb: "War map — conflict zones, intel feed, catalysts that move the book." },
  { href: "/intra-exitus", name: "Intra / Exitus", latin: "enter · exit", blurb: "Entry and exit levels — where to get in, where to get out." },
  { href: "/weekly", name: "Weekly Ranking", latin: "the weekly read", blurb: "Ranked cross-sectional forecast — who leads, who lags this week." },
  { href: "/kalman", name: "Kalman Pairs", latin: "the spread lens", blurb: "Adaptive pairs / stat-arb screen — cointegrated spreads and their z-scores." },
  { href: "/earnings", name: "Earnings Move", latin: "the print read", blurb: "Pre-earnings positioning context — momentum and insider posture into the print." },
  { href: "/smart-money", name: "Smart Money", latin: "the follow read", blurb: "Where informed flow is leaning — factor momentum + insider posture per name." },
  { href: "/trade-ideas", name: "Trade Ideas", latin: "the idea board", blurb: "One ranked board — weekly, earnings and smart-money reads pulled together." },
];

// The club's own tools + reference pages (not model modules).
export const CLUB_TOOLS: { href: string; name: string }[] = [
  { href: "/proposals", name: "Proposals" },
  { href: "/watchlist", name: "Watchlist" },
  { href: "/journal", name: "Decision journal" },
  { href: "/performance", name: "Performance" },
  { href: "/members", name: "Ownership" },
];

export const REFERENCE: { href: string; name: string }[] = [
  { href: "/how-it-works", name: "How it works" },
  { href: "/glossary", name: "Glossary" },
  { href: "/models", name: "Model registry" },
];

// Everything behind the members login. /nova redirects to /war-map.
export const PROTECTED_PATHS: string[] = [
  "/dashboard",
  "/nova",
  ...MODULES.map((m) => m.href),
  ...CLUB_TOOLS.map((t) => t.href),
  ...REFERENCE.map((r) => r.href),
];
