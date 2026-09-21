"use client";

import { useEffect, useRef, useState } from "react";
import { gloss } from "@/lib/glossary";

// ═══════════════════════════════════════════════════════════════════════════
// Shared read-visualization primitives. Used by the Equity, Macro and Stress
// readers so the app speaks one visual language: define terms in place, show
// a decisive band, and lead with a plain conclusion.
// ═══════════════════════════════════════════════════════════════════════════

// ── Info — a "?" that reveals a term's definition + why it matters ───────────
export function Info({ term, children }: { term: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const entry = gloss(term);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        aria-label={`What is ${term}?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-foreground/30 text-[9px] font-semibold leading-none text-muted transition hover:border-foreground/60 hover:text-foreground"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-64 border border-hairline bg-background p-3 text-left shadow-lg"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-foreground">{term}</span>
          <span className="mt-1 block text-xs leading-relaxed text-foreground/85">{entry.def}</span>
          <span className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-muted">Why it matters</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{entry.why}</span>
        </span>
      )}
    </span>
  );
}

// A metric label with a dotted underline that carries its definition.
export function DefLabel({ term, className = "" }: { term: string; className?: string }) {
  const has = !!gloss(term);
  return (
    <Info term={term}>
      <span className={`${has ? "cursor-help border-b border-dotted border-foreground/30" : ""} ${className}`}>
        {term}
      </span>
    </Info>
  );
}

// ── Tone helpers — every score axis is oriented so higher = better/greener ───
export function scoreTone(score: number | null): { text: string; bg: string; dot: string } {
  if (score == null) return { text: "text-muted", bg: "bg-foreground/10", dot: "bg-foreground/30" };
  if (score >= 62) return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/12", dot: "bg-emerald-500" };
  if (score >= 45) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/12", dot: "bg-amber-500" };
  if (score >= 30) return { text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/12", dot: "bg-orange-500" };
  return { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/12", dot: "bg-rose-500" };
}

// ── BandMeter — a decisive, labelled gauge for a 0..100 read ─────────────────
// `bands` are the segment names left→right (low score → high score).
export function BandMeter({
  score,
  band,
  bands,
  coverage,
}: {
  score: number | null;
  band: string | null;
  bands: string[];
  coverage?: number;
}) {
  const tone = scoreTone(score);
  const pos = score == null ? 50 : Math.max(2, Math.min(98, score));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={`text-lg font-semibold capitalize ${tone.text}`}>{band ?? "—"}</span>
        <span className="font-mono text-xs text-muted">
          {score == null ? "no data" : `${Math.round(score)}/100`}
          {coverage != null && coverage < 0.6 ? " · thin" : ""}
        </span>
      </div>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-rose-500/50 via-amber-400/50 to-emerald-500/55">
        {score != null && (
          <div
            className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-foreground shadow"
            style={{ left: `calc(${pos}% - 2px)` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
        {bands.map((b) => (
          <span key={b} className={b === band ? `font-semibold ${tone.text}` : ""}>
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── VerdictHeader — the decisive one-line call, up top ───────────────────────
const STANCE_TONE: Record<string, string> = {
  attractive: "text-emerald-600 dark:text-emerald-400 border-emerald-600/40",
  constructive: "text-emerald-600 dark:text-emerald-400 border-emerald-600/30",
  neutral: "text-muted border-foreground/25",
  cautious: "text-amber-600 dark:text-amber-400 border-amber-600/40",
  avoid: "text-rose-600 dark:text-rose-400 border-rose-600/40",
  go: "text-emerald-600 dark:text-emerald-400 border-emerald-600/40",
  conditional: "text-amber-600 dark:text-amber-400 border-amber-600/40",
  "no-go": "text-rose-600 dark:text-rose-400 border-rose-600/40",
};

export function VerdictHeader({
  stance,
  conviction,
  call,
  reasons,
}: {
  stance: string;
  conviction: number;
  call: string;
  reasons?: string[];
}) {
  const tone = STANCE_TONE[stance] ?? STANCE_TONE.neutral;
  return (
    <div className="border-l-2 border-foreground/60 pl-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center border px-3 py-1 text-sm font-semibold uppercase tracking-wide ${tone}`}>
          {stance}
        </span>
        <span className="text-xs text-muted">
          conviction <span className="font-semibold text-foreground">{conviction}</span>/100
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${conviction}%` }} />
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-foreground">{call}</p>
      {reasons && reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-xs text-muted">
              — {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── AreaChart — a readable impulse-response chart (replaces the bare line) ────
export function AreaChart({
  path,
  unit,
  xLabel = "quarters",
}: {
  path: (number | null)[];
  unit: string;
  xLabel?: string;
}) {
  const width = 260;
  const height = 84;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 16;
  const pts = path
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => p.v != null);
  if (pts.length < 2) return <div className="mt-1 text-xs text-muted">— no path</div>;

  const vals = pts.map((p) => p.v);
  const dataMin = Math.min(0, ...vals);
  const dataMax = Math.max(0, ...vals);
  const span = dataMax - dataMin || 1;
  const n = path.length;
  const x = (i: number) => padL + (i / (n - 1)) * (width - padL - padR);
  const y = (v: number) => padT + (1 - (v - dataMin) / span) * (height - padT - padB);

  const line = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(pts[pts.length - 1].i).toFixed(1)} ${y(0).toFixed(1)} L ${x(pts[0].i).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const zeroY = y(0);

  // Peak (largest |value|) and endpoint callouts.
  const peak = pts.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a), pts[0]);
  const end = pts[pts.length - 1];
  const up = end.v >= 0;
  const stroke = up ? "text-emerald-500" : "text-rose-500";
  const fmt = (v: number) => (unit === "bps" ? `${v > 0 ? "+" : ""}${v.toFixed(0)}bp` : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  const uid = `g${Math.abs(hash(line))}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`mt-1 w-full ${stroke}`}>
      <defs>
        <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* zero baseline */}
      <line x1={padL} x2={width - padR} y1={zeroY} y2={zeroY} className="stroke-foreground/25" strokeWidth={1} strokeDasharray="2 2" />
      <text x={padL - 4} y={zeroY + 3} textAnchor="end" className="fill-foreground/40 text-[8px]">0</text>
      {/* area + line */}
      <path d={area} fill={`url(#${uid})`} stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      {/* peak marker */}
      <circle cx={x(peak.i)} cy={y(peak.v)} r={2.2} className="fill-foreground" />
      <text x={x(peak.i)} y={y(peak.v) - 4} textAnchor="middle" className="fill-foreground text-[8px] font-medium">
        {fmt(peak.v)}
      </text>
      {/* endpoint */}
      <circle cx={x(end.i)} cy={y(end.v)} r={1.8} className="fill-current" />
      {/* x axis label */}
      <text x={padL} y={height - 3} className="fill-foreground/40 text-[8px]">Q1</text>
      <text x={width - padR} y={height - 3} textAnchor="end" className="fill-foreground/40 text-[8px]">
        Q{n} · {xLabel}
      </text>
    </svg>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
