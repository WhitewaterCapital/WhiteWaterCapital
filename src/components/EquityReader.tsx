"use client";

import { useState } from "react";
import type {
  EquityExport,
  SecurityAnalysis,
  RankingEntry,
} from "@/lib/models/incepta-export";
import type { StressVerdict } from "@/lib/models/types";
import { Badge } from "@/components/ui";
import { ScoreBar } from "@/components/ScoreBar";
import { VerdictHeader, BandMeter, DefLabel } from "@/components/reads";
import { equityVerdict } from "@/lib/models/equity-read";

// ── Formatters. null → "—" ALWAYS (never 0, never a guess). ─────────────────
const dash = "—";
const pct = (x: number | null | undefined, signed = false) =>
  x == null ? dash : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const ratio = (x: number | null | undefined, d = 2) =>
  x == null ? dash : x.toFixed(d);
const price = (x: number | null | undefined) =>
  x == null ? dash : `$${x.toFixed(2)}`;
const bps = (x: number | null | undefined) =>
  x == null ? dash : `${x.toFixed(0)} bps`;
const money = (x: number | null | undefined) => {
  if (x == null) return dash;
  const a = Math.abs(x);
  if (a >= 1e12) return `$${(x / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  return `$${x.toFixed(0)}`;
};

const confTone = {
  high: "neutral",
  medium: "warn",
  low: "warn",
  insufficient: "down",
} as const;

export function EquityReader({ data }: { data: EquityExport }) {
  return (
    <div className="space-y-10">
      {/* Framing — decisive reads, grounded in real filings */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Bottom-up equity read</Badge>
          <span className="text-xs text-muted">
            Decisive reads on real SEC filings + prices · not personalised advice
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/80">
          For each name the engine pulls the real numbers; the read then takes a
          side — <strong className="text-foreground">own it / neutral / avoid</strong> —
          from three questions: is the business <em>healthy</em>, is it{" "}
          <em>cheap</em>, and is the <em>tape</em> with it. Hover any{" "}
          <span className="border-b border-dotted border-foreground/40">term</span> for
          what it means and why it matters.
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          Incepta {data.schema_version} · engine {data.engine_version} · as of{" "}
          {data.as_of} · {data.universe.length} names
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{data.disclaimer}</p>
      </div>

      <AnalyzeTicker universe={data.universe} />

      <RankingsTable rankings={data.rankings.quality} asOf={data.as_of} />

      <div>
        <h3 className="eyebrow mb-3">Securities · {data.securities.length}</h3>
        <div className="space-y-5">
          {data.securities.map((s) => (
            <SecurityCard key={s.ticker} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Enter any ticker → the engine pulls its real SEC + price data on demand.
function AnalyzeTicker({ universe }: { universe: string[] }) {
  const [ticker, setTicker] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SecurityAnalysis | null>(null);
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setState("loading");
    setResult(null);
    setMessage("");
    try {
      const res = await fetch("/api/models/equity/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setResult(data.security);
        setSource(data.source);
        setState("done");
      } else {
        setMessage(data.message ?? "Not available.");
        setState("error");
      }
    } catch {
      setMessage("Couldn't reach the engine.");
      setState("error");
    }
  }

  return (
    <div className="border border-hairline bg-paper p-5">
      <p className="eyebrow">Analyze any ticker</p>
      <p className="mt-1 text-xs text-muted">
        Not in the {universe.length}-name set? Enter a ticker and the engine pulls
        its real SEC filings + prices on demand. A first-time name can take
        20–40s.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="e.g. GOOGL"
          className="w-40 border border-hairline bg-background px-3 py-2 text-sm uppercase outline-none focus:border-foreground/40"
        />
        <button
          disabled={state === "loading"}
          className="bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {state === "loading" ? "Running engine…" : "Analyze"}
        </button>
      </form>

      {state === "loading" && (
        <p className="mt-3 text-xs text-muted">
          Running the engine on {ticker} — pulling SEC filings + prices. This is a
          live computation, not a lookup.
        </p>
      )}
      {state === "error" && <p className="mt-3 text-sm text-rose-500">{message}</p>}
      {state === "done" && result && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">
            {source === "universe"
              ? "From the current universe."
              : "Computed live by the engine — real SEC + price data."}
          </p>
          <SecurityCard s={result} />
        </div>
      )}
    </div>
  );
}

function RankingsTable({ rankings, asOf }: { rankings: RankingEntry[]; asOf: string }) {
  return (
    <div>
      <h3 className="eyebrow mb-1">Quality ranking</h3>
      <p className="mb-3 text-xs text-muted">
        <strong className="text-foreground/70">Relative to the {rankings.length}-name universe below</strong>,
        not the whole market. Percentile (0–100) and z-score of a composite of
        fundamental-quality metrics (ROA, margins, leverage, revenue growth,
        Piotroski F) at each name&apos;s latest filing. Cross-sectional, this
        run only — not an absolute or time-series rating. As of {asOf}.
      </p>
      <div className="border border-hairline bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-4 py-2 font-medium">Ticker</th>
              <th className="px-4 py-2 text-right font-medium">Percentile</th>
              <th className="px-4 py-2 text-right font-medium">Z-score</th>
              <th className="px-4 py-2">Relative quality</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => (
              <tr key={r.ticker} className="border-t border-hairline">
                <td className="px-4 py-2 font-medium">{r.ticker}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.rank}</td>
                <td
                  className={`px-4 py-2 text-right tabular-nums ${
                    r.score >= 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {r.score >= 0 ? "+" : ""}
                  {r.score.toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  <div className="max-w-[160px]">
                    <ScoreBar score={Math.max(-100, Math.min(100, r.score * 33))} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecurityCard({ s }: { s: SecurityAnalysis }) {
  const insufficient = s.confidence === "insufficient";
  const greyed = insufficient || s.confidence === "low";
  const allFlags = [
    ...(s.data_quality.flags ?? []),
    ...(s.valuation?.flags ?? []),
  ];

  // The decisive read — computed from this name's real numbers.
  const v = insufficient
    ? null
    : equityVerdict({ quality: s.quality, valuation: s.valuation, risk: s.risk });

  return (
    <section
      className={`border border-hairline bg-paper p-5 ${greyed ? "opacity-70" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold">{s.ticker}</h4>
            <Badge tone={confTone[s.confidence]}>{s.confidence}</Badge>
          </div>
          <p className="text-sm text-muted">
            {s.name ?? dash}
            {s.sector ? ` · ${s.sector}` : ""}
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <div className="tabular-nums text-foreground">
            {price(s.data_quality.price_last_close)}
          </div>
          <div>as of {s.as_of}</div>
        </div>
      </div>

      {/* Flags — the honesty layer */}
      {allFlags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {allFlags.map((f, i) => (
            <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ {f}
            </li>
          ))}
        </ul>
      )}

      {insufficient ? (
        <p className="mt-4 text-sm text-muted">
          Not enough data — the engine abstains rather than show unreliable
          numbers.
        </p>
      ) : (
        <>
          {/* THE CALL — decisive, up top */}
          {v && (
            <div className="mt-4">
              <VerdictHeader
                stance={v.stance}
                conviction={v.conviction}
                call={v.call}
                reasons={v.reasons}
              />
              {/* the three questions, as decisive bands */}
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div>
                  <div className="eyebrow mb-2">Health</div>
                  <BandMeter score={v.health.score} band={v.health.band} coverage={v.health.coverage} bands={["distressed", "watch", "sound", "robust"]} />
                  <p className="mt-2 text-xs text-muted">{v.health.headline}</p>
                </div>
                <div>
                  <div className="eyebrow mb-2">Valuation</div>
                  <BandMeter score={v.valuation.score} band={v.valuation.band} coverage={v.valuation.coverage} bands={["extreme", "rich", "fair", "cheap"]} />
                  <p className="mt-2 text-xs text-muted">{v.valuation.headline}</p>
                </div>
                <div>
                  <div className="eyebrow mb-2">Trend</div>
                  <BandMeter score={v.trend.score} band={v.trend.band} coverage={v.trend.coverage} bands={["broken", "weak", "constructive", "strong"]} />
                  <p className="mt-2 text-xs text-muted">{v.trend.headline}</p>
                </div>
              </div>
            </div>
          )}

          {/* The numbers behind the call */}
          <details className="mt-5 border-t border-hairline pt-4">
            <summary className="cursor-pointer text-xs font-medium text-accent hover:underline">
              The numbers behind the call
            </summary>
            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <MetricGroup
                title="Risk"
                empty={!s.risk && "No price history."}
                rows={
                  s.risk && [
                    ["12–1 momentum", pct(s.risk.mom_12_1, true)],
                    ["1-month return", pct(s.risk.ret_1m, true)],
                    ["Realized vol (ann.)", pct(s.risk.realized_vol)],
                    ["Downside vol", pct(s.risk.downside_vol)],
                    ["Max drawdown (1y)", pct(s.risk.max_dd_1y, true)],
                    ["Distance to 52w high", ratio(s.risk.high_52w_ratio)],
                    ["Market beta", ratio(s.risk.beta_mkt)],
                    ["Idiosyncratic vol", pct(s.risk.idio_vol)],
                    ["Est. spread", bps(s.risk.spread_bps)],
                  ]
                }
              />
              <MetricGroup
                title="Quality"
                empty={!s.quality && "No fundamentals."}
                rows={
                  s.quality && [
                    ["ROA", pct(s.quality.roa)],
                    ["ROE", pct(s.quality.roe)],
                    ["Gross margin", pct(s.quality.gross_margin)],
                    ["Net margin", pct(s.quality.net_margin)],
                    ["FCF margin", pct(s.quality.fcf_margin)],
                    ["Revenue growth", pct(s.quality.rev_growth, true)],
                    ["Leverage (debt/assets)", ratio(s.quality.leverage)],
                    [
                      "Piotroski F-score",
                      s.quality.piotroski_f == null
                        ? dash
                        : `${s.quality.piotroski_f} / ${s.quality.piotroski_max ?? 9}`,
                    ],
                  ]
                }
              />
              <MetricGroup
                title="Valuation"
                empty={!s.valuation && "No valuation."}
                rows={
                  s.valuation && [
                    ["Market cap", money(s.valuation.market_cap)],
                    ["P/E", ratio(s.valuation.pe, 1)],
                    ["Earnings yield (E/P)", pct(s.valuation.earnings_yield)],
                    ["P/B", ratio(s.valuation.pb, 1)],
                    ["P/S", ratio(s.valuation.ps, 1)],
                    ["FCF yield", pct(s.valuation.fcf_yield)],
                    ["EV / Sales", ratio(s.valuation.ev_sales, 1)],
                  ]
                }
              />
            </div>
          </details>

          <StressAction ticker={s.ticker} />
        </>
      )}
    </section>
  );
}

function MetricGroup({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: [string, string][] | null | undefined | false;
  empty: string | false | undefined;
}) {
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      {rows ? (
        <dl className="space-y-1.5">
          {rows.map(([k, val]) => (
            <div key={k} className="flex items-center justify-between gap-2 text-sm">
              <dt className="text-muted">
                <DefLabel term={k} />
              </dt>
              <dd className="tabular-nums">{val}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">{empty || dash}</p>
      )}
    </div>
  );
}

// Per-trade flow: feed this security into Distresse (direction-aware) via
// /api/models/stress. This is the adversarial, instrument-specific view.
function StressAction({ ticker }: { ticker: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [verdict, setVerdict] = useState<StressVerdict | null>(null);

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/models/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, instrument: "long" }),
      });
      const data = await res.json();
      setVerdict(data.distresse);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const ratingTone = { go: "up", conditional: "warn", "no-go": "down" } as const;

  return (
    <div className="mt-5 border-t border-hairline pt-4">
      {!verdict ? (
        <button
          onClick={run}
          disabled={state === "loading"}
          className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
        >
          {state === "loading"
            ? "Running Distresse…"
            : "Stress-test this as a long in Distresse →"}
        </button>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Distresse · long</span>
            <Badge tone={ratingTone[verdict.rating]}>{verdict.rating}</Badge>
            <span className="text-xs text-muted">
              conviction {verdict.conviction}/100
            </span>
            {verdict.healthBand && (
              <span className="text-xs text-muted">· health: {verdict.healthBand}</span>
            )}
          </div>
          <p className="mt-2 text-sm text-foreground/80">{verdict.bottomLine}</p>
          <p className="mt-2 text-[11px] text-muted">{verdict.generatedBy}</p>
        </div>
      )}
      {state === "error" && (
        <p className="text-xs text-rose-500">Couldn&apos;t reach Distresse.</p>
      )}
    </div>
  );
}
