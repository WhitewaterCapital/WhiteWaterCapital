"use client";

import { useEffect, useState } from "react";
import type { ModelCard } from "@/lib/live/desk";
import { LeanBar, callTone } from "./LeanBar";

// Every model as one scannable row; click → a side sheet with the full why.
export function ModelList({ cards }: { cards: ModelCard[] }) {
  const [open, setOpen] = useState<ModelCard | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  return (
    <>
      <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[var(--shadow)]">
        {cards.map((c, i) => (
          <li key={c.id} className="fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <button
              type="button"
              onClick={() => setOpen(c)}
              className="group grid w-full grid-cols-1 gap-3 px-5 py-4 text-left transition hover:bg-paper/70 sm:grid-cols-[13rem_1fr_9rem] sm:items-center sm:gap-6 sm:px-6"
            >
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.weight === 0 && c.available && (
                    <span className="text-[10px] uppercase tracking-wide text-muted">context</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted">{c.question}</p>
              </div>
              <p className={`text-sm leading-relaxed ${c.available ? "text-foreground/85" : "text-muted"}`}>{c.headline}</p>
              <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-semibold ${callTone(c.call)}`}>{c.available ? c.call : "No read"}</span>
                  {c.available && <span className="num font-mono text-xs text-muted">{c.conviction}</span>}
                </div>
                <div className="w-28">
                  <LeanBar direction={c.weight === 0 ? 0 : c.direction} conviction={c.conviction} size="sm" />
                </div>
                <span className="hidden text-[11px] text-muted transition group-hover:text-foreground sm:inline">Why →</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${open.name} breakdown`}>
          <button className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]" onClick={() => setOpen(null)} aria-label="Close" />
          <aside className="sheet relative h-full w-full max-w-xl overflow-y-auto border-l border-hairline bg-background px-6 py-7 shadow-2xl sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Model breakdown</p>
                <h2 className="serif mt-1 text-3xl">{open.name}</h2>
                <p className="mt-1 text-sm text-muted">{open.question}</p>
              </div>
              <button onClick={() => setOpen(null)} className="rounded-full border border-hairline px-3 py-1 text-xs text-muted hover:text-foreground">
                Close
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-hairline bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <span className={`serif text-2xl ${callTone(open.call)}`}>{open.available ? open.call : "No read"}</span>
                {open.available && <span className="num font-mono text-sm text-muted">conviction {open.conviction}</span>}
              </div>
              <div className="mt-3">
                <LeanBar direction={open.weight === 0 ? 0 : open.direction} conviction={open.conviction} />
              </div>
              <p className="mt-4 text-sm leading-relaxed">{open.headline}</p>
            </div>

            {open.breakdown.sections.map((s) => (
              <section key={s.title} className="mt-7">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                {s.summary && <p className="mt-1 text-sm text-muted">{s.summary}</p>}
                <dl className="mt-3 divide-y divide-hairline border-y border-hairline">
                  {s.rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2.5">
                      <dt className="text-sm text-foreground/85">{r.label === "•" ? <span className="text-muted">•</span> : r.label}</dt>
                      <dd className="num text-right font-mono text-sm">{r.value}</dd>
                      {r.note && <dd className="col-span-2 text-xs leading-relaxed text-muted">{r.note}</dd>}
                      {r.score != null && (
                        <dd className="col-span-2">
                          <div className="h-1 w-full rounded-full bg-hairline">
                            <div
                              className={`h-1 rounded-full ${r.score >= 60 ? "bg-long" : r.score <= 40 ? "bg-short" : "bg-neutral-lean"}`}
                              style={{ width: `${Math.max(3, r.score)}%` }}
                            />
                          </div>
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              </section>
            ))}

            <section className="mt-8 rounded-xl bg-paper p-4">
              <h3 className="eyebrow">How it decides</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">{open.breakdown.method}</p>
              <p className="mt-3 text-xs text-muted">Sources: {open.breakdown.sources.join(" · ")}</p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
