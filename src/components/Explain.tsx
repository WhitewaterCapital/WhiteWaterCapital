import type { ReactNode } from "react";
import { TERMS } from "@/lib/explain";

// Comprehension layer, shared across the model pages. All server-rendered — the
// tooltip is pure CSS (hover + keyboard focus), no client JS — so it drops into
// any async page component.

/**
 * An inline jargon term with a plain-language tooltip (definition + why it
 * matters) pulled from TERMS. Falls back to plain text if the term is unknown.
 *
 *   <Term k="decile">decile</Term>
 */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const entry = TERMS[k];
  const label = children ?? k;
  if (!entry) return <>{label}</>;
  return (
    <span
      tabIndex={0}
      className="group relative inline cursor-help border-b border-dotted border-muted/70 outline-none"
    >
      {label}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden w-72 max-w-[80vw] border border-hairline bg-paper p-3 text-left text-xs font-normal leading-relaxed normal-case tracking-normal shadow-lg group-hover:block group-focus-within:block"
      >
        <span className="block font-medium text-foreground">{entry.def}</span>
        <span className="mt-1.5 block text-muted">{entry.why}</span>
      </span>
    </span>
  );
}

/**
 * A friendly "How to read this" callout — the first thing a non-technical
 * member should see on a page. Pass a few short plain-language points.
 */
export function HowToRead({
  title = "How to read this",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="border border-hairline bg-paper/60 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full border border-accent/50 text-[11px] font-semibold text-accent"
        >
          ?
        </span>
        <p className="eyebrow !mb-0">{title}</p>
      </div>
      <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-foreground/85">
        {children}
      </div>
    </div>
  );
}

/**
 * The plain-English "so what" for a page or card — the biggest, clearest
 * sentence, so the takeaway lands before any number does.
 */
export function Takeaway({ children }: { children: ReactNode }) {
  return (
    <p className="text-base leading-relaxed text-foreground/90 sm:text-lg">
      {children}
    </p>
  );
}

/**
 * A soft, plain-language "this is demo data" note — honest without the wall of
 * technical caveats. Use where the underlying feed is synthetic-demo.
 */
export function DemoNote({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300/90">
      <span aria-hidden>●</span>
      <span>
        {children ?? (
          <>
            <strong className="font-semibold">Example data.</strong> These are
            illustrative names to show the page working — not real picks yet,
            while we connect the live market feed.
          </>
        )}
      </span>
    </div>
  );
}
