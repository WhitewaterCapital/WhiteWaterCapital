import { ModuleNav } from "@/components/ModuleNav";
import { Card, Badge } from "@/components/ui";
import { Term, HowToRead, DemoNote } from "@/components/Explain";
import { earningsMove, EARNINGS_MOVE_UNIVERSE } from "@/lib/models/impl/earnings-move";
import { getEarningsExport } from "@/lib/earnings";
import type { EquityReading, EquitySignal } from "@/lib/models/types";

// Earnings Move — PLATFORM_REBUILD_PLAN.md priority #13/#14. Server-renders
// earningsMove.read() directly, same pattern smart-money/page.tsx set for
// its own EquityModel. This is deliberately NOT a surprise-direction or
// price-move predictor (see earnings-move.ts's own header and the research
// dossier's "Medium confidence, needs paid estimate data" verdict on that
// harder problem) — it's a calendar + the two real positioning signals this
// app already has, attached honestly, with abstention where an input is
// missing. Distresse's own earnings-catalyst devil's-advocate note points
// here rather than duplicating this reasoning inline.
export const dynamic = "force-dynamic";

export default async function EarningsPage() {
  const dateISO = new Date().toISOString().slice(0, 10);
  const [data, calendarExport] = await Promise.all([
    earningsMove.read(dateISO),
    getEarningsExport(),
  ]);

  return (
    <div>
      <ModuleNav crumb="Earnings Move" />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// Earnings Move</p>
          <span className="font-mono text-xs text-muted">upcoming prints × pre-print positioning</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Who reports earnings next — and how the desk is positioned going in.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Upcoming earnings dates for {EARNINGS_MOVE_UNIVERSE.length} names ({EARNINGS_MOVE_UNIVERSE.join(", ")}).
          This does <em>not</em> predict which way a stock will jump on its results — instead, for each name with a
          print coming up, it shows whether{" "}
          <Term k="insider posture">insiders have been buying or selling</Term> and whether the name has momentum
          behind it. A research read, not a forecast.
        </p>

        <div className="mt-6">
          <HowToRead>
            <p>
              • <strong className="font-medium text-foreground">Each row is a name with earnings coming up</strong>,
              and the date it reports.
            </p>
            <p>
              • The <Term k="lean">lean</Term> commits to a side going into the print — bullish or bearish —
              from insider positioning and momentum. It&apos;s how we&apos;re positioned, not a prediction of the
              result.
            </p>
            <p>
              • <strong className="font-medium text-foreground">Earnings are high-risk events.</strong> This is
              context to prepare with, not a bet on the outcome.
            </p>
          </HowToRead>
        </div>

        {calendarExport?.data_provenance === "synthetic-demo" ? (
          <div className="mt-4">
            <DemoNote>
              <strong className="font-semibold">Example dates.</strong> These print dates are illustrative
              placeholders while we connect a live earnings calendar — not confirmed report dates yet.
            </DemoNote>
          </div>
        ) : null}

        <div className="mt-8">
          <EarningsTable data={data} />
        </div>
      </main>
    </div>
  );
}

function EarningsTable({ data }: { data: EquityReading }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Research read</Badge>
          <span className="text-xs text-muted">Calendar + real pre-print positioning · not investment advice</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">{data.summary}</p>
      </div>

      {data.signals.length === 0 ? (
        <Card>
          <p className="eyebrow">No prints in the lookahead window</p>
          <p className="mt-2 text-sm text-foreground/80">
            Either WW-EARNINGS hasn&apos;t exported yet, or none of the {EARNINGS_MOVE_UNIVERSE.length} tracked names
            have a confirmed print inside its lookahead window right now — this is the expected state between
            earnings seasons, not a fabricated empty table.
          </p>
        </Card>
      ) : (
        <Card title="Upcoming prints — soonest first">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 text-right font-medium">Lean into print</th>
                  <th className="pb-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {data.signals.map((s) => (
                  <SignalRow key={s.symbol} s={s} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            The lean commits to a side going into the print, from insider pre-print positioning and momentum
            (insider flow leads when they disagree). It&apos;s how the desk is positioned into the event — not a
            forecast of which way the result itself moves the stock.
          </p>
        </Card>
      )}

      <p className="text-[11px] text-muted">Overall breadth across flagged names: {data.breadth > 0 ? "+" : ""}{data.breadth}.</p>
    </div>
  );
}

function SignalRow({ s }: { s: EquitySignal }) {
  return (
    <tr className="border-t border-hairline">
      <td className="py-2 font-medium">{s.symbol}</td>
      <td className="py-2 text-right tabular-nums">
        {s.score !== 0 ? (s.score > 0 ? "+" : "") : ""}
        {s.score !== 0 ? s.score : "—"}
      </td>
      <td className="py-2 text-xs text-muted">{s.note}</td>
    </tr>
  );
}
