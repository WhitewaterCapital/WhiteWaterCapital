import { ReactNode } from "react";

// A labelled figure with an optional sub-line and up/down tone.
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "neutral";
}) {
  const toneClass =
    tone === "up"
      ? "text-long"
      : tone === "down"
        ? "text-short"
        : "text-foreground";
  return (
    <div className="border-t border-foreground/80 pt-3">
      <div className="eyebrow">{label}</div>
      <div className={`serif num mt-2 text-4xl tracking-tight ${toneClass}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

export function Card({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-6 shadow-[var(--shadow)]">
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between">
          {title ? <h2 className="eyebrow">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "up" | "down" | "neutral" | "warn";
}) {
  const map = {
    up: "border-transparent bg-long/12 text-long",
    down: "border-transparent bg-short/12 text-short",
    warn: "border-transparent bg-amber-500/12 text-amber-700 dark:text-amber-400",
    neutral: "border-hairline text-muted",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${map[tone]}`}
    >
      {children}
    </span>
  );
}
