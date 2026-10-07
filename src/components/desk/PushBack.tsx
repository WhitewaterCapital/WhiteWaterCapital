"use client";

import { useRef, useState } from "react";
import type { ChallengeReply } from "@/lib/live/challenge";

type Turn = { q: string; a?: ChallengeReply; error?: string };

const EXAMPLES = [
  "But they just raised guidance",
  "The valuation is too expensive here",
  "Insiders have been selling",
  "Rates are going to hurt this",
];

// Argue with the desk: the member's point → fact check + fresh research +
// a re-run of the call as if they're right.
export function PushBack({ ticker, call }: { ticker: string; call: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const send = async (q: string) => {
    const point = q.trim();
    if (!point || busy) return;
    setBusy(true);
    setText("");
    setTurns((t) => [...t, { q: point }]);
    try {
      const r = await fetch(`/api/desk/${encodeURIComponent(ticker)}/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: point }),
      });
      const j = await r.json();
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? (r.ok ? { ...x, a: j } : { ...x, error: j.error ?? "Something went wrong." }) : x)));
    } catch {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: "Couldn't reach the desk." } : x)));
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-[var(--shadow)] sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="serif text-2xl">Push back on the call</h2>
        <span className="text-xs text-muted">The desk says {call}. Tell it what you&apos;re seeing.</span>
      </div>

      {turns.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => send(e)} className="rounded-full border border-hairline px-3 py-1.5 text-xs text-foreground/75 transition hover:border-foreground/40 hover:text-foreground">
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-6">
        {turns.map((t, i) => (
          <div key={i} className="fade-up space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-sm text-background">{t.q}</p>
            {!t.a && !t.error && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-hairline border-t-foreground/60" />
                Checking the numbers and the last 30 days of coverage…
              </div>
            )}
            {t.error && <p className="text-sm text-short">{t.error}</p>}
            {t.a && <Reply a={t.a} />}
          </div>
        ))}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="mt-5 flex items-center gap-2 rounded-full border border-hairline bg-background px-4 py-1.5 focus-within:border-foreground/40"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “they just won a big contract — that's bullish”"
          maxLength={400}
          aria-label="Your point"
          className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted/80"
        />
        <button disabled={busy || !text.trim()} className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-40">
          Argue
        </button>
      </form>
    </div>
  );
}

function Reply({ a }: { a: ChallengeReply }) {
  return (
    <div className="max-w-[92%] space-y-4 rounded-2xl rounded-bl-sm border border-hairline bg-background px-5 py-4">
      <p className="text-sm leading-relaxed">{a.answer}</p>
      {a.whatIf && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">If you&apos;re right:</span>
          <span className="rounded-full border border-hairline px-2.5 py-1">
            {a.whatIf.before} · {a.whatIf.beforeConviction}
          </span>
          <span className="text-muted">→</span>
          <span className={`rounded-full px-2.5 py-1 font-medium ${a.whatIf.changed ? "bg-accent/15 text-accent" : "border border-hairline"}`}>
            {a.whatIf.after} · {a.whatIf.afterConviction}
          </span>
        </div>
      )}
      {a.facts.length > 0 && (
        <div>
          <p className="eyebrow">What the numbers say</p>
          <ul className="mt-1.5 space-y-1 text-sm text-foreground/80">
            {a.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {(a.research.supporting.length > 0 || a.research.contradicting.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["Backs you up", a.research.supporting, "bg-long"],
              ["Cuts against you", a.research.contradicting, "bg-short"],
            ] as const
          ).map(([label, items, dot]) =>
            items.length ? (
              <div key={label}>
                <p className="eyebrow">{label}</p>
                <ul className="mt-1.5 space-y-1.5">
                  {items.map((n) => (
                    <li key={n.url} className="flex gap-2 text-sm">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="leading-snug text-foreground/85 hover:underline">
                        {n.title} <span className="text-xs text-muted">· {n.source}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      )}
      <p className="text-[11px] text-muted">
        {a.engine === "claude" ? "Written by Claude from the facts above." : "Rules engine — no paid AI. Facts come from filings, prices and the linked articles."}
      </p>
    </div>
  );
}
