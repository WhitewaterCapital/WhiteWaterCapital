import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { LineChart } from "@/components/LineChart";
import { ExposureGauge } from "@/components/ExposureGauge";
import { Stat, Card } from "@/components/ui";
import { StateOfBook } from "@/components/StateOfBook";
import { loadBook } from "@/lib/book";
import { readClub } from "@/lib/club-store";
import { MODULES, CLUB_TOOLS, REFERENCE } from "@/lib/modules";
import { computeMetrics } from "@/lib/metrics";
import { money, pct, shortDate, num } from "@/lib/format";

// THE DESK — the members launcher. Modules come from src/lib/modules.ts
// (shared with the module menu and the auth proxy); portfolio below.

// Live book: render per request (the IBKR client caches the statement itself).
export const dynamic = "force-dynamic";

export default async function DeskPage() {
  const [book, club] = await Promise.all([loadBook(), readClub()]);
  const openVotes = club.proposals.filter((p) => p.status === "open").length;
  const { account, history } = book;
  const broker = { name: book.source, isSample: book.isSample };
  const hasCurve = history.length >= 2;
  const m = hasCurve ? computeMetrics(history, book.periodsPerYear) : null;
  const labels = history.map((s) => shortDate(s.date));
  // Non-USD books are compared with SPY converted into the base currency.
  const spyLabel = book.currency === "USD" ? "SPY" : `SPY in ${book.currency}`;

  return (
    <div>
      <ModuleNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="rise rise-1 font-mono text-sm text-accent">{"// The Desk"}</p>
        <h1 className="rise rise-2 display mt-2 text-4xl sm:text-5xl">
          Good to see you.
        </h1>

        <StateOfBook book={book} openVotes={openVotes} />

        {/* Club tools — the weekly workflow shortcuts */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs uppercase tracking-[0.12em]">
          {CLUB_TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="text-muted hover:text-foreground">
              {t.name} →
            </Link>
          ))}
        </div>

        {/* Module launcher */}
        <div className="mt-8 flex flex-wrap justify-end gap-x-5 gap-y-1 text-xs uppercase tracking-[0.12em]">
          {REFERENCE.map((r) => (
            <Link key={r.href} href={r.href} className="text-muted hover:text-foreground">
              {r.name} →
            </Link>
          ))}
        </div>
        <div className="mt-3 grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
          {MODULES.map((mod, i) => (
            <Link
              key={mod.href}
              href={mod.href}
              className={`rise rise-${Math.min(i + 1, 4)} group relative bg-background p-7 transition hover:bg-paper ${
                i === MODULES.length - 1 && MODULES.length % 2 !== 0
                  ? "sm:col-span-2"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{mod.name}</h2>
                  <p className="mt-0.5 font-mono text-xs text-muted">{mod.latin}</p>
                </div>
                <span className="text-lg text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  ↘
                </span>
              </div>
              <p className="mt-4 text-sm text-foreground/80">{mod.blurb}</p>
              <span className="mt-4 inline-block text-[11px] uppercase tracking-wide text-accent">
                Open →
              </span>
            </Link>
          ))}
        </div>

        {/* Portfolio — the specifics */}
        <section className="mt-14">
          {broker.isSample && (
            <div className="mb-4 border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              <strong>Sample data — not the club&apos;s real book.</strong> Every number in this
              section (account value, return, Sharpe, holdings, P&amp;L, the equity curve) is
              placeholder data so the desk is usable before the brokerage is wired. Connect the
              IBKR adapter (set <code>BROKER=ibkr</code> + the Flex token/query — see docs/IBKR_SETUP.md) to show live
              numbers — this banner disappears automatically once real data flows.
            </div>
          )}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="eyebrow">Portfolio</h2>
              <Link
                href="/performance"
                className="text-xs text-accent hover:underline"
              >
                Performance breakdown →
              </Link>
            </div>
            <span className="text-xs text-muted">
              {broker.isSample ? (
                <span className="text-amber-600 dark:text-amber-400">Source: {broker.name} — illustrative</span>
              ) : (
                <>
                  Source: {broker.name}
                  {book.asOf ? ` · as of close ${book.asOf}` : ""}
                </>
              )}
            </span>
          </div>

          {book.error && (
            <div className="mb-4 border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
              <strong>Couldn&apos;t load the book from {broker.name}.</strong> {book.error}
            </div>
          )}
          {m && (
          <>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="Account Value" value={money(account.totalValueUsd, book.currency)} />
            <Stat
              label="Total Return"
              value={pct(m.portReturn)}
              tone={m.portReturn >= 0 ? "up" : "down"}
              sub={book.hasBenchmark ? `vs ${spyLabel} ${pct(m.alpha)}` : "SPY unavailable"}
            />
            <Stat
              label="Cash"
              value={money(account.cashUsd, book.currency)}
              sub={`${m.exposure.cashPct.toFixed(0)}% of pool`}
            />
            <Stat label="Sharpe" value={num(m.sharpe, 2)} sub={`vol ${(m.volatility * 100).toFixed(0)}%`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Cumulative return — us vs SPY">
                <LineChart
                  labels={labels}
                  yFormat={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
                  series={[
                    { values: m.portIndexed.map((v) => v - 100), color: "currentColor", label: "Us" },
                    ...(book.hasBenchmark
                      ? [{ values: m.spyIndexed.map((v) => v - 100), color: "#9ca3af", label: spyLabel }]
                      : []),
                  ]}
                />
              </Card>
            </div>
            <Card title="Exposure">
              <div className="flex h-full items-center justify-center py-4">
                <ExposureGauge investedPct={m.exposure.investedPct} />
              </div>
            </Card>
          </div>

          </>
          )}

          <div className="mt-6">
            <Card
              title="Holdings"
              action={
                <Link href="/journal" className="text-xs text-accent hover:underline">
                  Why we own these →
                </Link>
              }
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2 font-medium">Symbol</th>
                    <th className="pb-2 text-right font-medium">Value</th>
                    <th className="pb-2 text-right font-medium">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {account.positions.length === 0 && (
                    <tr className="border-t border-hairline">
                      <td colSpan={3} className="py-3 text-muted">
                        {book.error ? "—" : "No open positions."}
                      </td>
                    </tr>
                  )}
                  {account.positions.map((p) => (
                    <tr key={p.symbol} className="border-t border-hairline">
                      <td className="py-2 font-medium">
                        {p.symbol}
                        <span className="ml-2 text-xs text-muted">{p.quantity} sh</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{money(p.marketValueUsd, book.currency)}</td>
                      <td className={`py-2 text-right tabular-nums ${p.unrealizedPnlUsd >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {p.unrealizedPnlUsd >= 0 ? "+" : ""}
                        {money(p.unrealizedPnlUsd, book.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          {book.trades.length > 0 && (
            <div className="mt-6">
              <Card title="Recent fills">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Symbol</th>
                      <th className="pb-2 font-medium">Side</th>
                      <th className="pb-2 text-right font-medium">Qty</th>
                      <th className="pb-2 text-right font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.trades.slice(0, 8).map((t) => (
                      <tr key={t.id} className="border-t border-hairline">
                        <td className="py-2 tabular-nums text-muted">{t.executedAt.slice(0, 10)}</td>
                        <td className="py-2 font-medium">{t.symbol}</td>
                        <td className={`py-2 uppercase ${t.side === "buy" ? "text-emerald-500" : "text-rose-500"}`}>{t.side}</td>
                        <td className="py-2 text-right tabular-nums">{t.quantity}</td>
                        <td className="py-2 text-right tabular-nums">{money(t.priceUsd, book.currency, { cents: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
