// ---------------------------------------------------------------------------
// The "models" layer. Every model — Distresse, Intra, the Macro Tracker, and
// your own proprietary macro algos — is described by ModelMeta and plugged into
// the registry. Nothing sits under one monolith; the registry is the hub.
// ---------------------------------------------------------------------------

export type ModelKind = "evaluator" | "levels" | "macro" | "equity" | "custom";

export type ModelStatus = "live" | "beta" | "planned";

export type ModelMeta = {
  id: string;
  name: string; // e.g. "Distresse"
  kind: ModelKind;
  status: ModelStatus;
  tagline: string; // one line for the hub card
  description: string; // what it does + how to read it
  etymology?: string; // the naming story, shown small
};

// --- A trade idea, the input to the Stress Test engines --------------------

export type Instrument = "long" | "short" | "call" | "put" | "future";

// Evidence that can ride along with an idea — e.g. the Incepta equity engine's
// risk/quality/valuation read for the ticker. Distresse is the judge; this is
// the evidence it judges on. Loosely typed so any evidence source can attach.
export type TradeEvidence = {
  source: string; // e.g. "Incepta v1.0.0"
  confidence: string; // the security's confidence level
  asOf?: string;
  risk?: Record<string, number | null> | null;
  quality?: Record<string, number | null> | null;
  valuation?: Record<string, number | null> | null;
  flags?: string[];
};

export type TradeIdea = {
  ticker: string;
  instrument: Instrument;
  thesis: string;
  horizon?: string; // "3–6 months"
  sizePct?: number; // intended % of book
  evidence?: TradeEvidence; // optional engine evidence for Distresse
};

// --- Distresse output: the adversarial verdict -----------------------------

export type Rating = "go" | "conditional" | "no-go";

export type Dimension = {
  label: string; // "Macro regime fit"
  score: number; // -100 (hostile) .. +100 (supportive)
  note: string;
};

// A concrete line of evidence behind the verdict — real number + read.
export type EvidenceRow = {
  label: string;
  value: string; // pre-formatted (honours null → "—")
  verdict: string; // decisive one-liner on this number
  score: number | null; // 0..100 contribution, null if input missing
};

export type EvidenceGroup = {
  group: string; // "Financial health", "Valuation", …
  band: string | null; // e.g. "robust", "rich"
  score: number | null; // 0..100 on the group's own axis
  coverage: number; // fraction backed by real data
  headline: string; // decisive conclusion for the group
  rows: EvidenceRow[];
};

export type StressVerdict = {
  ticker: string;
  instrument: Instrument;
  rating: Rating;
  conviction: number; // 0..100
  regime: string; // one-line macro regime read
  dimensions: Dimension[]; // quant/macro eagle-eye scorecard
  devilsAdvocate: string[]; // the strongest case against
  tailRisks: string[]; // low-probability, high-impact
  bottomLine: string; // straight-up call, in plain words
  generatedBy: string; // model id + evidence provenance
  // --- concrete-evidence layer (present when real evidence was available) ----
  healthScore?: number | null; // 0 (distressed) .. 100 (robust)
  healthBand?: string | null;
  coverage?: number; // overall fraction of the read backed by real data
  asOf?: string; // as-of date of the underlying evidence
  evidence?: EvidenceGroup[]; // the numbers, grouped and read
  noEvidence?: boolean; // true when no real data exists for this name here
};

// --- Intra output: entry/exit plan -----------------------------------------

export type EntryExitPlan = {
  ticker: string;
  instrument: Instrument;
  bias: "long" | "short" | "none"; // "none" = no tradeable setup / abstain
  entryZone: [number, number] | null; // buy/sell band (null when abstaining)
  stop: number | null;
  targets: number[]; // scale-out levels (empty when abstaining)
  sizingPct: number | null; // suggested % of book
  timeStop: string; // "exit if thesis hasn't played by …"
  rationale: string;
  invalidations: string[]; // what kills the setup
  generatedBy: string;
  // --- optional real-levels layer ------------------------------------------
  confidence?: "actionable" | "watch" | "insufficient";
  lastClose?: number | null; // the real anchor the levels are built from
  riskReward?: string; // e.g. "risk 1R → targets 1.5R / 3R / 5R"
  noSetup?: boolean; // true when there's no real price to place levels on
};

// --- Macro Tracker output: a dated reading ---------------------------------

export type SectorRead = {
  sector: string;
  sentiment: number; // -100 .. +100
  note: string;
};

export type Catalyst = {
  date: string; // ISO
  event: string;
  importance: "high" | "medium" | "low";
};

export type MacroReading = {
  date: string; // ISO date of the reading
  regime: string; // e.g. "Late-cycle, easing bias"
  sentiment: number; // overall -100 .. +100
  sectors: SectorRead[];
  catalysts: Catalyst[];
  summary: string; // background / narrative
  generatedBy: string;
};

// --- Equity model output: a bottom-up read --------------------------------
// The equity counterpart to MacroReading. Adjust the fields to whatever your
// equity model actually produces — this is a sensible starting shape.

export type EquitySignal = {
  symbol: string;
  score: number; // -100 (bearish) .. +100 (bullish)
  note: string;
};

export type EquityReading = {
  date: string; // ISO date of the reading
  breadth: number; // overall equity-market read, -100 .. +100
  signals: EquitySignal[]; // per-name (or per-theme) reads
  summary: string; // background / narrative
  generatedBy: string;
};

// ---------------------------------------------------------------------------
// Model contracts.
//
// Every algorithm you build implements ONE of these interfaces and gets
// registered in registry.ts. That's the whole plug-in surface — pick the kind
// that matches what your model produces, implement the single method, register
// it. The app only ever talks to these interfaces, never to a specific model.
// ---------------------------------------------------------------------------

export interface BaseModel {
  meta: ModelMeta;
}

// Judges a trade idea (Distresse and anything like it).
export interface EvaluatorModel extends BaseModel {
  evaluate(idea: TradeIdea): Promise<StressVerdict>;
}

// Turns an idea into entry/exit levels (Intra / Exitus).
export interface LevelsModel extends BaseModel {
  plan(idea: TradeIdea): Promise<EntryExitPlan>;
}

// Produces a dated macro reading (Sentimentum · Macro + your macro algos).
export interface MacroModel extends BaseModel {
  read(dateISO: string): Promise<MacroReading>;
}

// Produces a dated equity reading (Sentimentum · Equity + your equity algos).
export interface EquityModel extends BaseModel {
  read(dateISO: string): Promise<EquityReading>;
}

export type AnyModel =
  | EvaluatorModel
  | LevelsModel
  | MacroModel
  | EquityModel;
