import { Suspense } from "react";
import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { LeanBar, callTone } from "@/components/desk/LeanBar";
import { Sparkline } from "@/components/desk/Sparkline";
import { ModelList } from "@/components/desk/ModelList";
import { PushBack } from "@/components/desk/PushBack";
import { News, NewsSkeleton } from "@/components/desk/News";
import { SearchBox } from "@/components/desk/SearchBox";
import { runDesk } from "@/lib/live/desk";

// THE TICKER DESK — any stock: every model run live, one clear call, the why
// behind each model a click away, the news around it, and a place to argue.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

const money = (x: number | null | undefined, cur = "USD") =>
  x == null ? "—" : x.toLocaleString("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: x < 10 ? 3 : 2 });

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  const d = await runDesk(ticker);

  if (!d) {
    return (
      <div>
        <ModuleNav crumb={ticker} />
        <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="eyebrow">Not found</p>
          <h1 className="serif mt-2 text-4xl">No listed stock called “{ticker}”.</h1>
          <p className="mt-3 text-muted">Try the company name instead — the search understands both.</p>
          <div className="mt-8 w-full">
            <SearchBox autoFocus />
          </div>
        </main>
      </div>
    );
  }

  const q = d.quote;
  const up = (q.change ?? 0) >= 0;
  const lo = Math.min(...d.spark.map((p) => p.close));
  const hi = Math.max(...d.spark.map((p) => p.close));
  const plan = d.plan && d.plan.bias !== "none" && d.plan.entryZone ? d.plan : null;

  return (
    <div>
      <ModuleNav crumb={ticker} />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-8 sm:px-6">
        {/* ── identity + price ── */}
        <section className="fade-up flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              {[d.exchange, d.sector, d.industry].filter(Boolean).join(" · ")}
            </p>
            <h1 className="serif mt-1 truncate text-4xl leading-tight sm:text-5xl">{d.name}</h1>
            <p className="mt-1 font-mono text-sm text-muted">{d.ticker}</p>
          </div>
          <div className="text-right">
            <div className="serif num text-5xl leading-none">{money(q.price, q.currency ?? "USD")}</div>
            <div className={`num mt-2 font-mono text-sm ${up ? "text-long" : "text-short"}`}>
              {q.change == null ? "—" : `${up ? "+" : ""}${(q.change * 100).toFixed(2)}% today`}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="h-20">
            <Sparkline points={d.spark} height={80} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
            <span>1Y · low {money(lo)}</span>
            <span>high {money(hi)} · data to {d.asOf}</span>
          </div>
        </section>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-4 lg:grid-cols-8">
          {d.stats.map((s) => (
            <div key={s.label} className="bg-surface px-4 py-3">
              <dt className="text-[11px] text-muted">{s.label}</dt>
              <dd className="num mt-0.5 font-mono text-sm">{s.value}</dd>
            </div>
          ))}
        </dl>

        {/* ── the desk's call ── */}
        <section className="glow mt-10">
          <div className="surface rounded-3xl p-6 sm:p-9">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <p className="eyebrow">The desk&apos;s call</p>
                <div className="mt-2 flex items-baseline gap-4">
                  <span className={`serif text-6xl leading-none sm:text-7xl ${callTone(d.view.call)}`}>{d.view.call}</span>
                  <span className="num font-mono text-lg text-muted">{d.view.conviction}<span className="text-xs">/100</span></span>
                </div>
                <div className="mt-5 max-w-sm">
                  <LeanBar direction={d.view.score} conviction={d.view.conviction} size="lg" />
                  <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wide text-muted">
                    <span>Short</span>
                    <span>Neutral</span>
                    <span>Long</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-lg leading-relaxed">{d.view.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {d.view.agree.map((m) => (
                    <span key={m} className="rounded-full bg-long/10 px-2.5 py-1 text-long">✓ {m}</span>
                  ))}
                  {d.view.disagree.map((m) => (
                    <span key={m} className="rounded-full bg-short/10 px-2.5 py-1 text-short">✕ {m}</span>
                  ))}
                </div>
                {plan && (
                  <p className="mt-5 border-t border-hairline pt-4 text-sm text-foreground/85">
                    <span className="font-medium">Plan ({plan.bias}):</span> enter {money(plan.entryZone![0])}–{money(plan.entryZone![1])}, stop{" "}
                    {money(plan.stop)}, targets {plan.targets.map((t) => money(t)).join(" / ")}
                    {plan.sizingPct != null ? `, size ~${plan.sizingPct}% of the book` : ""}.
                    <span className="text-muted"> {plan.confidence === "actionable" ? "Actionable." : "Watch — not a live setup yet."}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── the models ── */}
        <section className="mt-12">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="serif text-3xl">What each model says</h2>
            <span className="text-xs text-muted">Click any model for the full breakdown</span>
          </div>
          <ModelList cards={d.cards} />
          {d.flags.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              Data notes: {d.flags.join(" · ")}
            </p>
          )}
        </section>

        {/* ── news ── */}
        <section className="mt-12">
          <h2 className="serif mb-4 text-3xl">The news</h2>
          <Suspense fallback={<NewsSkeleton />}>
            <News ticker={d.ticker} name={d.name} industry={d.industry} />
          </Suspense>
        </section>

        {/* ── argue ── */}
        <section className="mt-12">
          <PushBack ticker={d.ticker} call={d.view.call} />
        </section>

        <p className="mt-10 text-xs leading-relaxed text-muted">
          Research read on public data (SEC filings, exchange prices, analyst consensus, news) — not investment advice.
          Models can be wrong; the breakdowns show exactly what each one used.{" "}
          <Link href="/dashboard" className="underline hover:text-foreground">New search</Link>
        </p>
      </main>
    </div>
  );
}
