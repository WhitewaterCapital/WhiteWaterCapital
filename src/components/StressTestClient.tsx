"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { ScoreBar } from "@/components/ScoreBar";
import { BandMeter } from "@/components/reads";
import type {
  StressVerdict,
  EntryExitPlan,
  Instrument,
  EvidenceGroup,
} from "@/lib/models/types";

type Result = {
  distresse: StressVerdict;
  intra: EntryExitPlan;
  evidenceNote?: string | null;
};

const GROUP_BANDS: Record<string, string[]> = {
  "Financial health": ["distressed", "watch", "sound", "robust"],
  Valuation: ["extreme", "rich", "fair", "cheap"],
  "Trend / momentum": ["broken", "weak", "constructive", "strong"],
  "Volatility / liquidity": ["volatile", "elevated", "normal", "calm"],
};

const INSTRUMENTS: { value: Instrument; label: string }[] = [
  { value: "long", label: "Long stock" },
  { value: "short", label: "Short stock" },
  { value: "call", label: "Call option" },
  { value: "put", label: "Put option" },
  { value: "future", label: "Future" },
];

const ratingTone = { go: "up", conditional: "warn", "no-go": "down" } as const;

export function StressTestClient() {
  const [ticker, setTicker] = useState("");
  const [instrument, setInstrument] = useState<Instrument>("long");
  const [thesis, setThesis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ticker.trim()) {
      setError("Enter a ticker.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/models/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, instrument, thesis }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setResult(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Idea form */}
      <Card title="The idea">
        <form onSubmit={run} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className="eyebrow">Ticker</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="NVDA"
                className="mt-1 w-full border border-hairline bg-background px-3 py-2 text-sm uppercase outline-none focus:border-foreground/40"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Instrument</span>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as Instrument)}
                className="mt-1 w-full border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="eyebrow">Thesis</span>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              rows={3}
              placeholder="Why this, why now, what you expect to happen."
              className="mt-1 w-full resize-y border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <button
            disabled={loading}
            className="bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Running…" : "Run Distresse + Intra / Exitus"}
          </button>
        </form>
      </Card>

      {result ? (
        <div className="space-y-4">
          {result.evidenceNote && (
            <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ {result.evidenceNote}
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <DistressePanel v={result.distresse} />
            <IntraPanel p={result.intra} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DistressePanel({ v }: { v: StressVerdict }) {
  const healthTone =
    v.healthScore == null
      ? "text-muted"
      : v.healthScore >= 58
        ? "text-emerald-600 dark:text-emerald-400"
        : v.healthScore >= 40
          ? "text-amber-600 dark:text-amber-400"
          : "text-rose-600 dark:text-rose-400";

  return (
    <Card
      title="Distresse — stress test"
      action={<Badge tone={ratingTone[v.rating]}>{v.rating.toUpperCase()}</Badge>}
    >
      {v.noEvidence ? (
        <div>
          <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            ⚠ No real evidence for this name here.
          </div>
          <p className="mt-3 text-sm">{v.bottomLine}</p>
          <p className="mt-3 text-[11px] text-muted">{v.generatedBy}</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">
              {v.ticker} · {v.instrument}
            </span>
            <span className="text-sm text-muted">
              conviction{" "}
              <span className="font-semibold text-foreground">{v.conviction}</span>/100
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">{v.regime}</p>

          {/* Distress headline — the core question */}
          {v.healthScore != null && (
            <div className="mt-4 flex items-baseline gap-3 border-l-2 border-foreground/50 pl-3">
              <span className={`text-2xl font-semibold capitalize ${healthTone}`}>
                {v.healthBand}
              </span>
              <span className="text-xs text-muted">
                financial health {v.healthScore}/100 · 0 = distressed, 100 = robust
              </span>
            </div>
          )}

          {/* Bottom line — decisive call, up top */}
          <div className="mt-4 border border-hairline bg-background/40 p-3">
            <p className="eyebrow">The call</p>
            <p className="mt-1 text-sm leading-relaxed">{v.bottomLine}</p>
          </div>

          {/* Concrete evidence — real numbers, grouped and read */}
          {v.evidence && v.evidence.length > 0 && (
            <div className="mt-5 space-y-4">
              {v.evidence.map((g) => (
                <EvidenceBlock key={g.group} g={g} />
              ))}
            </div>
          )}

          {/* Fit-to-trade scorecard */}
          {v.dimensions.length > 0 && (
            <Section title="Fit for this trade (−100 hostile … +100 supportive)">
              <div className="space-y-3">
                {v.dimensions.map((d) => (
                  <div key={d.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{d.label}</span>
                      <span
                        className={`tabular-nums ${d.score >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                      >
                        {d.score > 0 ? "+" : ""}
                        {d.score}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ScoreBar score={d.score} />
                    </div>
                    <p className="mt-1 text-xs text-muted">{d.note}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Devil's advocate — the case against your side">
            <ul className="space-y-1.5">
              {v.devilsAdvocate.map((d, i) => (
                <li key={i} className="text-sm text-foreground/80">
                  — {d}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Tail risks">
            <ul className="space-y-1.5">
              {v.tailRisks.map((t, i) => (
                <li key={i} className="text-sm text-foreground/80">
                  — {t}
                </li>
              ))}
            </ul>
          </Section>

          <p className="mt-4 text-[11px] text-muted">
            {v.generatedBy}
            {v.asOf ? ` · evidence as of ${v.asOf}` : ""}
          </p>
        </>
      )}
    </Card>
  );
}

function EvidenceBlock({ g }: { g: EvidenceGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-hairline pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
            {g.group}
          </p>
          <div className="mt-1.5">
            <BandMeter
              score={g.score}
              band={g.band}
              coverage={g.coverage}
              bands={GROUP_BANDS[g.group] ?? ["low", "", "", "high"]}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">{g.headline}</p>
        </div>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-[11px] font-medium text-accent hover:underline"
      >
        {open ? "Hide numbers" : "Show numbers"}
      </button>
      {open && (
        <dl className="mt-2 space-y-1">
          {g.rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="text-muted">{r.label}</dt>
              <dd className="flex items-baseline gap-2">
                <span className="tabular-nums text-foreground">{r.value}</span>
                <span className="hidden text-muted sm:inline">· {r.verdict}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function IntraPanel({ p }: { p: EntryExitPlan }) {
  const biasTone = p.bias === "long" ? "up" : p.bias === "short" ? "down" : "neutral";
  if (p.noSetup || p.bias === "none" || p.entryZone == null || p.stop == null) {
    return (
      <Card title="Intra / Exitus — entry & exit" action={<Badge tone="neutral">NO SETUP</Badge>}>
        <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠ No tradeable levels — abstaining rather than invent prices.
        </div>
        <p className="mt-3 text-sm text-foreground/80">{p.rationale}</p>
        <p className="mt-3 text-[11px] text-muted">{p.generatedBy}</p>
      </Card>
    );
  }
  return (
    <Card
      title="Intra / Exitus — entry & exit"
      action={
        <div className="flex items-center gap-2">
          {p.confidence && <Badge tone={p.confidence === "actionable" ? "up" : "warn"}>{p.confidence}</Badge>}
          <Badge tone={biasTone}>{p.bias.toUpperCase()}</Badge>
        </div>
      }
    >
      {p.lastClose != null && (
        <p className="mb-3 text-xs text-muted">
          Levels built off the real last close{" "}
          <span className="font-semibold text-foreground tabular-nums">{p.lastClose}</span>
          {p.riskReward ? ` · ${p.riskReward}` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Entry zone" value={`${p.entryZone[0]} – ${p.entryZone[1]}`} />
        <Field label="Stop (1R)" value={String(p.stop)} tone="down" />
        <Field label="Targets" value={p.targets.join("  ·  ")} tone="up" />
        <Field label="Size" value={p.sizingPct == null ? "—" : `${p.sizingPct}% of book`} />
      </div>

      <Section title="Time stop">
        <p className="text-sm text-foreground/80">{p.timeStop}</p>
      </Section>
      <Section title="Rationale">
        <p className="text-sm text-foreground/80">{p.rationale}</p>
      </Section>
      <Section title="Invalidations">
        <ul className="space-y-1.5">
          {p.invalidations.map((inv, i) => (
            <li key={i} className="text-sm text-foreground/80">— {inv}</li>
          ))}
        </ul>
      </Section>
      <p className="mt-4 text-[11px] text-muted">{p.generatedBy}</p>
    </Card>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold tabular-nums ${
          tone === "up" ? "text-emerald-500" : tone === "down" ? "text-rose-500" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="eyebrow">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
