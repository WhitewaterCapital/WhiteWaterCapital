import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { Card, Badge } from "@/components/ui";
import { HowToRead, DemoNote } from "@/components/Explain";
import { plainDecile } from "@/lib/explain";
import { getWeeklyExport } from "@/lib/weekly";
import type { WeeklyExport } from "@/lib/models/weekly-export";
import { smartMoneyMomentum } from "@/lib/models/impl/smart-money-momentum";
import { earningsMove } from "@/lib/models/impl/earnings-move";
import { getEarningsExport } from "@/lib/earnings";
import type { EarningsExport } from "@/lib/models/earnings-export";
import type { EquityReading } from "@/lib/models/types";
import { shortDate } from "@/lib/format";

// TRADE IDEAS — the direct answer to the platform's founding request, "i
// want a proper bot which can suggest trades" (read exactly as written:
// SUGGEST, never place an order — the desk still executes every trade
// manually through IBKR). It unions the three real screens this codebase
// already built — WW-Weekly (ranked decile), Smart Money Momentum
// (insider × momentum), Earnings Move (pre-print positioning) — by ticker,
// badging each name by exactly which source(s) flagged it and why, in that
// source's own words. No single blended "conviction score": the three do
// not share confidence semantics, and averaging them would launder that
// into false agreement. Ordering rule: more sources agreeing = higher.
//
// This file adds a plain-language layer over that same honest logic (see
// src/lib/explain.ts + src/components/Explain.tsx) so a member who doesn't
// speak quant can read it: every card leads with a human sentence, and the
// jargon underneath carries a hover definition.
export const dynamic = "force-dynamic";

type SourceName = "Weekly" | "Smart Money" | "Earnings";
type Tone = "up" | "down" | "warn" | "neutral";

type SourceFlag = {
  source: SourceName;
  badge: string; // short plain badge, e.g. "Model favourite"
  plain: string; // the human lead sentence for this source
  tone: Tone;
  detail: string; // the model's own note (secondary, technical)
};

const fmtSigned = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

// Top/bottom 3 of WW-Weekly's 1..10 decile scale read as candidate
// longs/shorts here — a stated, round cutoff (roughly the top/bottom 30%
// of the ranked universe), not a fitted or backtested threshold.
const LONG_DECILE_FLOOR = 8;
const SHORT_DECILE_CEIL = 3;

function weeklyFlags(weekly: WeeklyExport | null): Map<string, SourceFlag> {
  const out = new Map<string, SourceFlag>();
  if (!weekly) return out;
  const synthetic = weekly.provenance.kind !== "live";
  for (const f of weekly.forecasts) {
    if (f.decile == null) continue;
    let bullish: boolean;
    if (f.decile >= LONG_DECILE_FLOOR) bullish = true;
    else if (f.decile <= SHORT_DECILE_CEIL) bullish = false;
    else continue; // middle of the ranked pack — no lean shown here
    const detail = synthetic
      ? `Ranked decile ${f.decile}/10 on example data (no live price feed wired in yet).`
      : `Ranks decile ${f.decile}/10 this week — relative-strength score ${fmtSigned(f.expected_relative_return)}${f.provisional ? ", provisional" : ""}.`;
    out.set(f.ticker, {
      source: "Weekly",
      badge: bullish ? "Model favourite" : "Model laggard",
      plain: plainDecile(f.decile),
      tone: synthetic ? "warn" : bullish ? "up" : "down",
      detail,
    });
  }
  return out;
}

function smartMoneyFlags(data: EquityReading): Map<string, SourceFlag> {
  const out = new Map<string, SourceFlag>();
  for (const s of data.signals) {
    const tone: Tone = s.score > 0 ? "up" : s.score < 0 ? "down" : "neutral";
    const plain =
      s.score > 0
        ? "Informed-flow signals (insider buying + momentum) lean positive on this name."
        : s.score < 0
          ? "Informed-flow signals (insider selling + momentum) lean negative on this name."
          : "Informed-flow signals are mixed — no clear lean.";
    out.set(s.symbol, {
      source: "Smart Money",
      badge: s.score > 0 ? "Insiders leaning in" : s.score < 0 ? "Insiders leaning out" : "Mixed",
      plain,
      tone,
      detail: s.note,
    });
  }
  return out;
}

function earningsFlags(data: EquityReading, calendar: EarningsExport | null): Map<string, SourceFlag> {
  const out = new Map<string, SourceFlag>();
  for (const s of data.signals) {
    const event = calendar?.events.find((e) => e.ticker.toUpperCase() === s.symbol.toUpperCase());
    const leanMatch = s.note.match(/(bullish-lean|bearish-lean|no lean)/);
    const lean = leanMatch ? leanMatch[1] : "no lean";
    const tone: Tone = lean === "bullish-lean" ? "up" : lean === "bearish-lean" ? "down" : "neutral";
    const dateLabel = event ? shortDate(event.report_date) : "date TBD";
    const plain =
      lean === "bullish-lean"
        ? `Reports earnings around ${dateLabel}, with a mild positive tilt going in.`
        : lean === "bearish-lean"
          ? `Reports earnings around ${dateLabel}, with a mild negative tilt going in.`
          : `Reports earnings around ${dateLabel} — flagged to watch, no directional tilt.`;
    out.set(s.symbol, {
      source: "Earnings",
      badge: `Earnings ${dateLabel}`,
      plain,
      tone,
      detail: s.note,
    });
  }
  return out;
}

export default async function TradeIdeasPage() {
  const dateISO = new Date().toISOString().slice(0, 10);
  const [weekly, smartMoney, earnings, calendar] = await Promise.all([
    getWeeklyExport(),
    smartMoneyMomentum.read(dateISO),
    earningsMove.read(dateISO),
    getEarningsExport(),
  ]);

  const wFlags = weeklyFlags(weekly);
  const sFlags = smartMoneyFlags(smartMoney);
  const eFlags = earningsFlags(earnings, calendar);

  const tickers = new Set<string>([...wFlags.keys(), ...sFlags.keys(), ...eFlags.keys()]);
  const rows = [...tickers]
    .map((ticker) => ({
      ticker,
      flags: [wFlags.get(ticker), sFlags.get(ticker), eFlags.get(ticker)].filter(
        (f): f is SourceFlag => f != null,
      ),
    }))
    .sort((a, b) => b.flags.length - a.flags.length || a.ticker.localeCompare(b.ticker));

  const weeklySynthetic = weekly ? weekly.provenance.kind !== "live" : false;
  const calendarSynthetic = calendar?.data_provenance === "synthetic-demo";
  const anyDemo = weeklySynthetic || calendarSynthetic;

  return (
    <div>
      <ModuleNav crumb="Trade Ideas" />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// Trade Ideas</p>
          <span className="font-mono text-xs text-muted">the idea board</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Names worth a look this week.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          A shortlist of stocks that at least one of our three models flagged — a place to
          <em> start </em> a conversation, never a recommendation to buy or sell. Nothing here places a
          trade; the desk still does that by hand.
        </p>

        <div className="mt-6">
          <HowToRead>
            <p>
              • <strong className="font-medium text-foreground">Each card is one stock</strong> a model
              flagged. The coloured tags say which model(s) flagged it and why.
            </p>
            <p>
              • <strong className="font-medium text-foreground">More tags = more models agree</strong> — those
              names sit at the top. Green leans positive, red leans negative.
            </p>
            <p>
              • <strong className="font-medium text-foreground">It&apos;s a starting point.</strong> Click
              <span className="text-accent"> Stress Test</span> on any name to pressure-test the idea before
              anyone acts on it.
            </p>
          </HowToRead>
        </div>

        {anyDemo && (
          <div className="mt-4">
            <DemoNote />
          </div>
        )}

        <div className="mt-8">
          {rows.length === 0 ? (
            <Card>
              <p className="eyebrow">Nothing flagged right now</p>
              <p className="mt-2 text-sm text-foreground/80">
                None of the three models has a name to surface this run — an honest empty board, not a
                filler placeholder. Check back after the next refresh, or open each model directly for its
                own coverage.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {rows.map((row) => (
                <IdeaCard key={row.ticker} row={row} />
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-muted">
          Ordered by how many models flag a name — more agreement, higher up. There&apos;s deliberately no
          single blended &ldquo;score&rdquo; across the three, because each measures something different; we
          keep them separate and let you see each read in its own words.
        </p>
      </main>
    </div>
  );
}

function IdeaCard({ row }: { row: { ticker: string; flags: SourceFlag[] } }) {
  const n = row.flags.length;
  const agree =
    n >= 3 ? "All three models flagged this name." : n === 2 ? "Two models flagged this name." : "One model flagged this name.";
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{row.ticker}</h3>
            {row.flags.map((f) => (
              <Badge key={f.source} tone={f.tone}>
                {f.badge}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{agree}</p>
        </div>
        <Link
          href={`/stress-test?ticker=${row.ticker}`}
          className="whitespace-nowrap text-xs font-medium text-accent hover:underline"
        >
          Run Stress Test →
        </Link>
      </div>

      {/* Plain-language lead per source, with the model's own note demoted underneath. */}
      <ul className="mt-4 space-y-3">
        {row.flags.map((f) => (
          <li key={f.source} className="border-t border-hairline pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm text-foreground/90">
              <span className="font-medium text-muted">{f.source}: </span>
              {f.plain}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{f.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
