import { Nav } from "@/components/Nav";
import { LineChart } from "@/components/LineChart";
import { Stat, Card, Badge } from "@/components/ui";
import { getBroker } from "@/lib/broker";
import { snapshots } from "@/lib/sample-data";
import { computeMetrics } from "@/lib/metrics";
import { usd, pct, shortDate, num } from "@/lib/format";

// MEMBERS DASHBOARD — full detail. Positions, P&L, risk metrics, activity.
// Behind the auth gate (see src/middleware.ts).
export default async function DashboardPage() {
  const broker = getBroker();
  const account = await broker.getAccount();
  const trades = await broker.getTrades();

  const m = computeMetrics(snapshots);
  const labels = snapshots.map((s) => shortDate(s.date));

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <span className="text-xs text-foreground/50">
            Source: {broker.name} · synced just now
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Stat
            label="Sharpe"
            value={num(m.sharpe, 2)}
            sub={`vol ${(m.volatility * 100).toFixed(0)}%`}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Account value vs SPY">
              <LineChart
                labels={labels}
                yFormat={(v) => v.toFixed(0)}
                series={[
                  { values: m.portIndexed, color: "currentColor", label: "Us" },
                  { values: m.spyIndexed, color: "#9ca3af", label: "SPY" },
                ]}
              />
            </Card>
          </div>
          <Card title="Risk">
            <dl className="space-y-3 text-sm">
              <Row k="Max drawdown" v={pct(-m.maxDrawdown)} tone="down" />
              <Row k="Volatility (ann.)" v={`${(m.volatility * 100).toFixed(0)}%`} />
              <Row k="Sharpe" v={num(m.sharpe, 2)} />
              <Row
                k="Exposure"
                v={`${m.exposure.investedPct.toFixed(0)}% invested`}
              />
              <Row
                k="Concentration"
                v={topConcentration(account.positions)}
              />
            </dl>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Positions">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-foreground/50">
                  <th className="pb-2 font-medium">Symbol</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {account.positions.map((p) => (
                  <tr key={p.symbol} className="border-t border-foreground/10">
                    <td className="py-2 font-medium">
                      {p.symbol}
                      <span className="ml-2 text-xs text-foreground/40">
                        {p.quantity} sh
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {usd(p.marketValueUsd)}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        p.unrealizedPnlUsd >= 0
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }`}
                    >
                      {p.unrealizedPnlUsd >= 0 ? "+" : ""}
                      {usd(p.unrealizedPnlUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Recent activity">
            <ul className="space-y-2 text-sm">
              {trades
                .slice()
                .reverse()
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between border-t border-foreground/10 py-2 first:border-0"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone={t.side === "buy" ? "up" : "down"}>
                        {t.side.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-foreground/50">
                        {t.quantity} @ {usd(t.priceUsd, { cents: true })}
                      </span>
                    </span>
                    <span className="text-xs text-foreground/40">
                      {shortDate(t.executedAt)}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-foreground/60">{k}</dt>
      <dd
        className={`tabular-nums font-medium ${
          tone === "down"
            ? "text-rose-500"
            : tone === "up"
              ? "text-emerald-500"
              : ""
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

function topConcentration(
  positions: { symbol: string; marketValueUsd: number }[],
): string {
  if (!positions.length) return "—";
  const total = positions.reduce((s, p) => s + p.marketValueUsd, 0) || 1;
  const top = positions.reduce((a, b) =>
    a.marketValueUsd > b.marketValueUsd ? a : b,
  );
  return `${top.symbol} ${((top.marketValueUsd / total) * 100).toFixed(0)}%`;
}
