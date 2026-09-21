"use client";

import { useState } from "react";
import type {
  MacroExport,
  Scenario,
  ScenarioEffect,
  RegimeRead,
  RegimeTilt,
  Nowcast,
  SteadyState,
  Confidence,
} from "@/lib/models/aurora-export";
import { Badge } from "@/components/ui";
import { AreaChart, DefLabel, Info } from "@/components/reads";

// ── Honesty formatters. null → "—" always, never 0. ────────────────────────
const dash = "—";
const pct = (x: number | null | undefined, d = 1, signed = false) =>
  x == null ? dash : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const num = (x: number | null | undefined, d = 2, signed = false) =>
  x == null ? dash : `${signed && x > 0 ? "+" : ""}${x.toFixed(d)}`;

function fmtUnit(x: number | null | undefined, unit: string, signed = true) {
  if (x == null) return dash;
  const s = signed && x > 0 ? "+" : "";
  if (unit === "bps") return `${s}${x.toFixed(1)} bps`;
  return `${s}${x.toFixed(2)}%`;
}

const confTone = {
  high: "neutral",
  medium: "warn",
  low: "warn",
  insufficient: "down",
} as const;

function Conf({ c }: { c: Confidence }) {
  return <Badge tone={confTone[c]}>{c} confidence</Badge>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISIVE MACRO SYNTHESIS — interpret the real impulse responses and take a
// side. The model is normalised to +1% shocks, so we read DIRECTION, MAGNITUDE
// and PERSISTENCE, not a forecast. For an equity-led book, output + consumption
// are the growth channel; the mortgage-rate path is the discount-rate channel.
// ═══════════════════════════════════════════════════════════════════════════
type Lean = "tailwind" | "headwind" | "mixed";

interface ScenarioRead {
  s: Scenario;
  lean: Lean;
  strength: number; // |book impact|, for ranking
  line: string; // decisive one-liner
}

const eff = (s: Scenario, v: string): ScenarioEffect | undefined =>
  s.effects.find((e) => e.variable === v);

function scenarioRead(s: Scenario): ScenarioRead {
  const out = eff(s, "output")?.impact ?? 0;
  const cons = eff(s, "consumption")?.impact ?? 0;
  const hp = eff(s, "house_price");
  const rate = eff(s, "mortgage_rate");
  // Growth channel: output + consumption on impact (already % points).
  const growth = 0.45 * out + 0.55 * cons;
  const lean: Lean = growth > 0.05 ? "tailwind" : growth < -0.05 ? "headwind" : "mixed";
  const strength = Math.abs(growth) + Math.abs((hp?.impact ?? 0) * 0.3);

  const rebounds = eff(s, "consumption")?.reverses || eff(s, "house_price")?.reverses;
  const ratePush = rate && Math.abs(rate.peak ?? 0) > 5 ? `; the mortgage rate swings ${fmtUnit(rate.peak, "bps")} at its peak` : "";
  const persist = rebounds ? " The drag is front-loaded — the model rebounds later, so it's a shock to trade, not a regime to hide from." : " The effect builds rather than fades over the horizon.";

  const consStr = `${cons > 0 ? "+" : ""}${cons.toFixed(2)}%`;
  let line: string;
  if (lean === "tailwind")
    line = `Pro-cyclical tailwind: consumption ${consStr} and output move up on impact${ratePush}. Risk-on names and beta are on the right side of this.`;
  else if (lean === "headwind")
    line = `Contractionary for the book: consumption and housing turn down on impact${ratePush}. Rate-sensitive, high-beta and housing-linked exposure is on the wrong side.${persist}`;
  else
    line = `Mixed for the book — the growth channel is roughly a wash on impact${ratePush}. The signal is in the composition, not the level.`;
  return { s, lean, strength, line };
}

function synthesise(scenarios: Scenario[]): {
  reads: ScenarioRead[];
  headline: string;
  positioning: string;
} {
  const reads = scenarios.map(scenarioRead).sort((a, b) => b.strength - a.strength);
  const tail = reads.find((r) => r.lean === "tailwind");
  const head = reads.find((r) => r.lean === "headwind");
  const biggest = reads[0];

  let headline: string;
  if (head && tail)
    headline = `The model's sharpest message: this book is most helped by a ${tail.s.label.toLowerCase()} and most hurt by a ${head.s.label.toLowerCase()}. The dominant driver here is the ${biggest.s.label.toLowerCase()}.`;
  else if (biggest)
    headline = `The dominant driver in the model is the ${biggest.s.label.toLowerCase()} — ${biggest.lean === "headwind" ? "a headwind" : biggest.lean === "tailwind" ? "a tailwind" : "a mixed signal"} for the book.`;
  else headline = "No scenarios to synthesise.";

  const positioning =
    head && head.strength >= (tail?.strength ?? 0)
      ? `Positioning read: lean defensive and short-duration while a ${head.s.label.toLowerCase()} is the live risk — it's the single most damaging shock to rate-sensitive and housing-linked exposure. Add pro-cyclical beta only on a confirmed ${tail ? tail.s.label.toLowerCase() : "growth"} impulse.`
      : tail
        ? `Positioning read: the model rewards pro-cyclical, growth-linked exposure into a ${tail.s.label.toLowerCase()}. Keep a defensive hedge sized for the ${head ? head.s.label.toLowerCase() : "rate"} tail, which is the main thing that breaks the thesis.`
        : `Positioning read: no shock dominates — keep balanced exposure and let the live-data regime read (coming online) break the tie.`;

  return { reads, headline, positioning };
}

const leanTone: Record<Lean, "up" | "down" | "warn"> = {
  tailwind: "up",
  headwind: "down",
  mixed: "warn",
};

// ═══════════════════════════════════════════════════════════════════════════
export function MacroReader({
  data,
  onHandoffToEquity,
}: {
  data: MacroExport;
  onHandoffToEquity?: () => void;
}) {
  return (
    <div className="space-y-10">
      {/* Framing + disclaimer */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Macro research</Badge>
          <span className="text-xs text-muted">
            Directional scenario analysis · not advice, not a forecast
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/80">
          A structural model of the economy (a housing/mortgage DSGE). It doesn&apos;t
          predict — it answers <em>&ldquo;if this shock hits, which way does the economy
          move, how hard, and does it last?&rdquo;</em> Below, that&apos;s turned into a
          decisive read for the book. Hover any{" "}
          <span className="border-b border-dotted border-foreground/40">term</span> for
          what it means.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{data.disclaimer}</p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          Aurora {data.schema_version} · engine {data.engine_version} ·{" "}
          {data.model_variant} · as of {data.as_of}
        </p>
      </div>

      <MacroCall scenarios={data.scenarios} />
      <RegimeCard regime={data.regime} />
      <SteadyStateCard s={data.steady_state} />
      <ScenarioBrowser scenarios={data.scenarios} />
      <TiltCard tilt={data.tilt} onHandoffToEquity={onHandoffToEquity} />
      <NowcastCard nowcast={data.nowcast} />
    </div>
  );
}

// ── The decisive macro call — the lead conclusion ───────────────────────────
function MacroCall({ scenarios }: { scenarios: Scenario[] }) {
  if (!scenarios.length) return null;
  const { reads, headline, positioning } = synthesise(scenarios);
  return (
    <section className="border border-foreground/30 bg-paper p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="eyebrow">The macro call</h2>
        <span className="text-[11px] text-muted">conditional on the shock · not a forecast</span>
      </div>
      <p className="text-[15px] leading-relaxed text-foreground">{headline}</p>
      <div className="mt-3 border-l-2 border-foreground/60 pl-4">
        <p className="text-sm leading-relaxed text-foreground/85">{positioning}</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {reads.map((r) => (
          <div key={r.s.id} className="border border-hairline p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{r.s.label}</span>
              <Badge tone={leanTone[r.lean]}>{r.lean}</Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.line}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Regime — where the live economy is now ─────────────────────────────────
function RegimeCard({ regime }: { regime: RegimeRead | null }) {
  if (!regime) {
    return (
      <Block title="Current environment (live regime)">
        <p className="text-sm text-muted">
          Not yet wired — the live regime read comes online with the FRED data
          layer. Until then the call above is the model&apos;s structural read of
          each shock, which is regime-independent.
        </p>
      </Block>
    );
  }
  const probs = regime.probabilities
    ? Object.entries(regime.probabilities).sort((a, b) => b[1] - a[1])
    : [];
  return (
    <Block title="Current environment" action={<Conf c={regime.confidence} />}>
      {regime.confidence === "insufficient" ? (
        <p className="text-sm text-muted">Not enough data for a regime call yet.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <h3 className="text-xl font-semibold">{regime.label ?? dash}</h3>
            <span className="text-xs text-muted">as of {regime.as_of}</span>
          </div>
          {probs.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {probs.map(([name, p]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <span className="w-56 shrink-0 text-muted">{name}</span>
                  <div className="h-2 flex-1 rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.round(p * 100)}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums">{pct(p, 0)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5">
            <p className="eyebrow mb-2">Key indicators</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2 font-medium">Indicator</th>
                    <th className="pb-2 text-right font-medium">Value</th>
                    <th className="pb-2 text-right font-medium">z-score</th>
                    <th className="pb-2 text-right font-medium">As of</th>
                  </tr>
                </thead>
                <tbody>
                  {regime.key_indicators.map((k) => (
                    <tr key={k.name} className="border-t border-hairline">
                      <td className="py-1.5">{k.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(k.value)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(k.z_score, 2, true)}</td>
                      <td className="py-1.5 text-right text-xs text-muted">{k.as_of ?? dash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {regime.flags.length > 0 && (
            <ul className="mt-4 space-y-1">
              {regime.flags.map((f, i) => (
                <li key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {f}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Block>
  );
}

// ── Steady state — the model's calibrated "normal" ─────────────────────────
function SteadyStateCard({ s }: { s: SteadyState }) {
  const rows: [string, string][] = [
    ["Capital / output", num(s.KYrat)],
    ["Housing / output", num(s.HYrat)],
    ["Hours worked", num(s.Nfrac)],
    ["Mortgage burden (of income)", pct(s.MPfrac)],
    ["Implied mortgage rate", pct(s.mortgage_rate_ann, 2)],
    ["Amortisation rate", pct(s.gamma, 2)],
  ];
  return (
    <Block title="Steady state — the model's normal">
      <p className="mb-4 max-w-2xl text-xs text-muted">
        The economy&apos;s resting point. Every scenario below is measured as a
        deviation <em>from</em> these levels — this is the &ldquo;normal&rdquo; the
        shocks push against.
      </p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="eyebrow">
              <DefLabel term={k} />
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        Calibrated to a residual norm of {s.residual_norm.toExponential(1)} (exact
        vs. the reference model).
      </p>
    </Block>
  );
}

// ── Scenarios — the core product ───────────────────────────────────────────
function ScenarioBrowser({ scenarios }: { scenarios: Scenario[] }) {
  const [active, setActive] = useState(0);
  const s = scenarios[active];
  const unitOf = (v: string) => s.paths.find((p) => p.variable === v)?.unit ?? "pct_dev";
  const read = scenarioRead(s);

  return (
    <Block title="Scenarios — shocks & the economy's response">
      <div className="flex flex-wrap gap-2">
        {scenarios.map((sc, i) => (
          <button
            key={sc.id}
            onClick={() => setActive(i)}
            className={`border px-3 py-1.5 text-xs font-medium transition ${
              i === active
                ? "border-foreground bg-foreground text-background"
                : "border-hairline text-muted hover:border-foreground/40 hover:text-foreground"
            }`}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{s.label}</h3>
          <Badge tone={leanTone[read.lean]}>{read.lean} for the book</Badge>
          <Conf c={s.confidence} />
        </div>
        <p className="mt-1 text-sm text-muted">{s.description}</p>

        {/* Decisive per-scenario read */}
        <p className="mt-3 border-l-2 border-foreground/50 pl-3 text-sm leading-relaxed">
          {read.line}
        </p>

        {/* Effects: direction, magnitude, persistence */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Variable</th>
                <th className="pb-2 text-center font-medium">Dir.</th>
                <th className="pb-2 text-right font-medium">
                  <Info term="On impact"><span className="cursor-help border-b border-dotted border-foreground/30">On impact</span></Info>
                </th>
                <th className="pb-2 text-right font-medium">
                  <Info term="Peak"><span className="cursor-help border-b border-dotted border-foreground/30">Peak</span></Info>
                </th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {s.effects.map((e) => {
                const unit = unitOf(e.variable);
                const dir =
                  e.impact == null
                    ? { ch: dash, cls: "text-muted" }
                    : e.impact > 0
                      ? { ch: "↑", cls: "text-emerald-500" }
                      : e.impact < 0
                        ? { ch: "↓", cls: "text-rose-500" }
                        : { ch: "→", cls: "text-muted" };
                return (
                  <tr key={e.variable} className="border-t border-hairline align-top">
                    <td className="py-2 capitalize">{e.variable.replace(/_/g, " ")}</td>
                    <td className={`py-2 text-center text-base ${dir.cls}`}>{dir.ch}</td>
                    <td className="py-2 text-right tabular-nums">{fmtUnit(e.impact, unit)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtUnit(e.peak, unit)}
                      <span className="ml-1 text-xs text-muted">Q{e.peak_quarter}</span>
                    </td>
                    <td className="py-2">
                      {e.reverses && (
                        <Info term="mean-reverts">
                          <Badge tone="neutral">mean-reverts</Badge>
                        </Info>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Impulse-response paths */}
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <p className="eyebrow">Response paths</p>
            <Info term="% deviation" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {s.paths.map((p) => (
              <div key={p.variable} className="border border-hairline p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize font-medium">{p.variable.replace(/_/g, " ")}</span>
                  <span className="font-mono text-[10px] text-muted">{p.unit === "bps" ? "bps" : "% dev"}</span>
                </div>
                <AreaChart path={p.path} unit={p.unit} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-hairline pt-4">
          <p className="eyebrow">Read for the book (from the engine)</p>
          <p className="mt-1 text-sm">{s.narrative}</p>
        </div>
      </div>
    </Block>
  );
}

// ── Tilt ────────────────────────────────────────────────────────────────────
function TiltCard({
  tilt,
  onHandoffToEquity,
}: {
  tilt: RegimeTilt | null;
  onHandoffToEquity?: () => void;
}) {
  if (!tilt) {
    return (
      <Block title="Positioning tilt">
        <p className="text-sm text-muted">
          The explicit factor/sector tilt table comes online with the live data
          layer. Until then, the positioning read in{" "}
          <strong className="text-foreground/80">The macro call</strong> above is the
          decisive lean.
        </p>
        {onHandoffToEquity && (
          <button onClick={onHandoffToEquity} className="mt-4 text-xs font-medium text-accent hover:underline">
            See the names in Equity →
          </button>
        )}
      </Block>
    );
  }
  const lean = (l: string) =>
    l === "overweight"
      ? "text-emerald-600 dark:text-emerald-400"
      : l === "underweight"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted";
  return (
    <Block title="Positioning tilt" action={<Conf c={tilt.confidence} />}>
      <p className="text-sm text-muted">
        Macro sets the weather — the lean below; the equity model picks the names.
      </p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <LeanList title="Factors" items={tilt.factors} leanClass={lean} />
        <LeanList title="Sectors" items={tilt.sectors} leanClass={lean} />
      </div>
      {onHandoffToEquity && (
        <button onClick={onHandoffToEquity} className="mt-5 text-xs font-medium text-accent hover:underline">
          See the names in Equity →
        </button>
      )}
    </Block>
  );
}

function LeanList({
  title,
  items,
  leanClass,
}: {
  title: string;
  items: { name: string; lean: string; rationale: string }[];
  leanClass: (l: string) => string;
}) {
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No {title.toLowerCase()} lean.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.name} className="text-sm">
              <span className="font-medium capitalize">{it.name}</span>{" "}
              <span className={`uppercase text-xs ${leanClass(it.lean)}`}>{it.lean}</span>
              <div className="text-xs text-muted">{it.rationale}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Nowcast ───────────────────────────────────────────────────────────────
function NowcastCard({ nowcast }: { nowcast: Nowcast | null }) {
  if (!nowcast) {
    return (
      <Block title="Factor nowcast">
        <p className="text-sm text-muted">
          The trained factor-return model comes online in a later phase. It will
          only surface an expected return where a factor shows genuine
          out-of-sample skill — otherwise it stays silent rather than guess.
        </p>
      </Block>
    );
  }
  return (
    <Block title="Factor nowcast" action={<Conf c={nowcast.confidence} />}>
      <p className="text-sm">{nowcast.summary}</p>
      <div className="mt-3 border-l-2 border-hairline pl-3">
        <p className="eyebrow">Read for the book</p>
        <p className="mt-1 text-sm text-foreground/80">{nowcast.book_read}</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2 font-medium">Factor</th>
              <th className="pb-2 text-right font-medium">Expected ({nowcast.horizon_months}m)</th>
              <th className="pb-2 text-right font-medium">OOS R²</th>
              <th className="pb-2 text-right font-medium">Hit rate</th>
            </tr>
          </thead>
          <tbody>
            {nowcast.factors.map((f) => (
              <tr key={f.factor} className="border-t border-hairline">
                <td className="py-2 font-medium">{f.factor}</td>
                <td className="py-2 text-right tabular-nums">
                  {f.skillful && f.expected_return != null ? (
                    pct(f.expected_return / 100, 2, true)
                  ) : (
                    <span className="text-xs text-muted">no out-of-sample signal</span>
                  )}
                </td>
                <td className={`py-2 text-right tabular-nums ${f.oos_r2 > 0 ? "text-emerald-500" : "text-muted"}`}>
                  {pct(f.oos_r2, 1, true)}
                </td>
                <td className="py-2 text-right tabular-nums">{pct(f.hit_rate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted">{nowcast.method} · as of {nowcast.as_of}</p>
    </Block>
  );
}

// ── Shared block wrapper ───────────────────────────────────────────────────
function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-hairline bg-paper p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
