import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { LineChart } from "@/components/LineChart";
import { ExposureGauge } from "@/components/ExposureGauge";
import { Stat, Card } from "@/components/ui";
import { StateOfBook } from "@/components/StateOfBook";
import { getBroker } from "@/lib/broker";
import { snapshots } from "@/lib/sample-data";
import { computeMetrics } from "@/lib/metrics";
import { usd, pct, shortDate, num } from "@/lib/format";

// THE DESK — the members launcher. Each module is a shell you fill with its
// own algo backend; portfolio/holdings below.
const MODULES = [
  {
    href: "/sentiment",
    name: "Sentimentum",
    latin: "the regime lens",
    blurb: "Top-down macro and cross-sector read.",
  },
  {
    href: "/stress-test",
    name: "Strictus Testum",
    latin: "the rigorous test",
    blurb: "Pressure-test a trade — the adversarial read.",
  },
  {
    href: "/war-map",
    name: "Nova",
    latin: "new things",
    blurb: "War map — conflict zones, intel feed, catalysts that move the book.",
  },
  {
    href: "/intra-exitus",
    name: "Intra / Exitus",
    latin: "enter · exit",
    blurb: "Entry and exit levels — where to get in, where to get out.",
  },
  {
    href: "/weekly",
    name: "Weekly Ranking",
    latin: "the weekly read",
    blurb: "Ranked cross-sectional forecast — who leads, who lags this week.",
  },
  {
    href: "/kalman",
    name: "Kalman Pairs",
    latin: "the spread lens",
    blurb: "Adaptive pairs / stat-arb screen — cointegrated spreads and their z-scores.",
  },
  {
    href: "/earnings",
    name: "Earnings Move",
    latin: "the print read",
    blurb: "Pre-earnings positioning context — momentum and insider posture into the print.",
  },
  {
    href: "/smart-money",
    name: "Smart Money",
    latin: "the follow read",
    blurb: "Where informed flow is leaning — factor momentum + insider posture per name.",
  },
  {
    href: "/trade-ideas",
    name: "Trade Ideas",
    latin: "the idea board",
    blurb: "One ranked board — weekly, earnings and smart-money reads pulled together.",
  },
];

export default async function DeskPage() {
  const broker = getBroker();
  const account = await broker.getAccount();
  const m = computeMetrics(snapshots);
  const labels = snapshots.map((s) => shortDate(s.date));

  return (
    <div>
      <ModuleNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="rise rise-1 font-mono text-sm text-accent">// The Desk</p>
        <h1 className="rise rise-2 display mt-2 text-4xl sm:text-5xl">
          Good to see you.
        </h1>

        <StateOfBook isSample={broker.isSample} />

        {/* Club tools — the weekly workflow shortcuts */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs uppercase tracking-[0.12em]">
          <Link href="/trade-ideas" className="text-muted hover:text-foreground">Trade ideas →</Link>
          <Link href="/watchlist" className="text-muted hover:text-foreground">Watchlist →</Link>
          <Link href="/journal" className="text-muted hover:text-foreground">Decision journal →</Link>
          <Link href="/proposals" className="text-muted hover:text-foreground">Proposals →</Link>
        </div>

        {/* Module launcher */}
        <div className="mt-8 flex flex-wrap justify-end gap-x-5 gap-y-1 text-xs uppercase tracking-[0.12em]">
          <Link href="/how-it-works" className="text-muted hover:text-foreground">
            How it works →
          </Link>
          <Link href="/glossary" className="text-muted hover:text-foreground">
            Glossary →
          </Link>
          <Link href="/models" className="text-muted hover:text-foreground">
            Model registry →
          </Link>
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
              <span className="mt-4 inline-block text-[11px] uppercase tracking-wide text-muted">
                Build in progress
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
              IBKR adapter (set <code>BROKER=ibkr</code> + gateway credentials) to show live
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
                <>Source: {broker.name} · synced just now</>
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="Account Value" value={usd(account.totalValueUsd)} />
            <Stat
              label="Total Return"
              value={pct(m.portReturn)}
              tone={m.portReturn >= 0 ? "up" : "down"}
              sub={`vs SPY ${pct(m.alpha)}`}
            />
            <Stat
              label="Cash"
              value={usd(account.cashUsd)}
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
                    { values: m.spyIndexed.map((v) => v - 100), color: "#9ca3af", label: "SPY" },
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
                  {account.positions.map((p) => (
                    <tr key={p.symbol} className="border-t border-hairline">
                      <td className="py-2 font-medium">
                        {p.symbol}
                        <span className="ml-2 text-xs text-muted">{p.quantity} sh</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{usd(p.marketValueUsd)}</td>
                      <td className={`py-2 text-right tabular-nums ${p.unrealizedPnlUsd >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {p.unrealizedPnlUsd >= 0 ? "+" : ""}
                        {usd(p.unrealizedPnlUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
