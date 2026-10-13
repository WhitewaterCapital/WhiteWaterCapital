import Link from "next/link";
import type { IntraExitusExport, IntraExitusPlan } from "@/lib/models/intra-exitus-export";
import { planStatus, type PlanStatus } from "@/lib/plan-status";

// Intra/Exitus plans judged against the LIVE price. The engine plans off the
// last settled close; a plan is "actionable" only if the engine says so AND
// today's price is actually in (or better than) the entry zone.
export type LiveQuote = { price: number | null; change: number | null };

const dash = "—";
const px = (n: number | null | undefined) => (n == null ? dash : `$${n.toFixed(2)}`);
const pct = (x: number | null | undefined) => (x == null ? "" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`);

const PILL: Record<PlanStatus["state"], string> = {
  "in-zone": "bg-long/12 text-long",
  better: "bg-long/12 text-long",
  wait: "bg-paper text-foreground/80",
  invalidated: "bg-short/12 text-short",
  "target-hit": "bg-paper text-muted",
  none: "bg-paper text-muted",
};

export function IntraExitusReader({ data, live }: { data: IntraExitusExport; live: Record<string, LiveQuote> }) {
  const rows = data.plans.map((p) => {
    const q = live[p.ticker] ?? { price: null, change: null };
    const st = planStatus(
      (p.bias as "long" | "short" | "none") ?? "none",
      (p.entryZone as [number, number] | null) ?? null,
      p.stop,
      p.targets,
      q.price ?? p.lastClose,
    );
    return { p, q, st, act: p.confidence === "actionable" && st.actionable };
  });
  const nAct = rows.filter((r) => r.act).length;
  const nWait = rows.filter((r) => r.st.state === "wait").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-foreground/85">
          <span className="font-semibold">{nAct}</span> actionable now · <span className="font-semibold">{nWait}</span> waiting for their entry ·{" "}
          {rows.length - nAct - nWait} standing aside
        </p>
        <p className="font-mono text-[11px] text-muted">
          levels from the {data.as_of} close · prices live · engine {data.engine_version}
        </p>
      </div>
      <div className="space-y-4">
        {rows.map(({ p, q, st, act }) => (
          <PlanCard key={p.ticker} p={p} q={q} st={st} act={act} />
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted">{data.disclaimer}</p>
    </div>
  );
}

function PlanCard({ p, q, st, act }: { p: IntraExitusPlan; q: LiveQuote; st: PlanStatus; act: boolean }) {
  const abstain = p.confidence === "insufficient" || !p.entryZone;
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-[var(--shadow)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href={`/t/${p.ticker}`} className="serif text-3xl hover:underline">
            {p.ticker}
          </Link>
          <span className="num font-mono text-sm">
            {px(q.price ?? p.lastClose)}{" "}
            <span className={(q.change ?? 0) >= 0 ? "text-long" : "text-short"}>{pct(q.change)}</span>
          </span>
          {!abstain && (
            <span className={`text-xs font-semibold uppercase tracking-wide ${p.bias === "short" ? "text-short" : "text-long"}`}>
              {p.bias}
            </span>
          )}
          <span className="text-xs text-muted">{p.regime}</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${abstain ? PILL.none : act ? PILL["in-zone"] : PILL[st.state]}`}>
          {abstain ? "Standing aside" : act ? "Actionable now" : p.confidence === "actionable" ? st.label : `Watch · ${st.label}`}
        </span>
      </div>

      {abstain ? (
        <p className="mt-3 text-sm text-muted">{p.rationale}</p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
            <Field label="Entry zone" value={`${px(p.entryZone![0])} – ${px(p.entryZone![1])}`} />
            <Field label="Stop" value={px(p.stop)} tone="short" />
            <Field label="Target" value={p.targets.length ? p.targets.map((t) => px(t)).join(" · ") : dash} tone="long" />
            <Field label="Expected (in time)" value={p.expectedR == null ? dash : `${p.expectedR >= 0 ? "+" : ""}${p.expectedR.toFixed(2)}R`} />
            <Field label="Size" value={p.sizingPct == null ? dash : `${p.sizingPct}% of book`} />
          </dl>
          <p className="mt-4 text-sm font-medium">{st.detail}</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">{p.rationale}</p>
          <p className="mt-2 text-xs text-muted">Time stop: {p.timeStop}</p>
          {p.invalidations.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {p.invalidations.map((inv, i) => (
                <li key={i} className="text-xs text-muted">— {inv}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`num mt-0.5 font-mono text-sm ${tone === "long" ? "text-long" : tone === "short" ? "text-short" : ""}`}>{value}</dd>
    </div>
  );
}
