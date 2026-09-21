import Link from "next/link";
import { snapshots, positions, proposals } from "@/lib/sample-data";
import { computeMetrics } from "@/lib/metrics";
import { pct, usd } from "@/lib/format";

// STATE OF THE BOOK — the plain-English "where do we stand" a member should be
// able to read in ten seconds, before any chart or model. Reads the same
// sample metrics/positions/proposals the rest of the Desk uses; swaps to real
// numbers automatically once the broker + a live proposals store are wired.
export function StateOfBook({ isSample = true }: { isSample?: boolean }) {
  const m = computeMetrics(snapshots);
  const ahead = m.alpha >= 0;
  const sorted = [...positions].sort((a, b) => b.unrealizedPnlUsd - a.unrealizedPnlUsd);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const openVotes = proposals.filter((p) => p.status === "open").length;

  return (
    <section className="rise rise-3 mt-8 border border-hairline bg-paper/50 p-6 sm:p-7">
      <p className="eyebrow">Where we stand</p>

      <p className="mt-3 text-xl leading-snug sm:text-2xl">
        We&apos;re{" "}
        <span className={ahead ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
          {pct(m.portReturn)} since launch
        </span>{" "}
        — {ahead ? "ahead of" : "behind"} the S&amp;P 500 by {pct(Math.abs(m.alpha))}.
      </p>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/85">
        {best && best.unrealizedPnlUsd > 0 ? (
          <>
            <strong className="font-medium">{best.symbol}</strong> is our strongest position right now (
            {usd(best.unrealizedPnlUsd)}), {worst && worst.unrealizedPnlUsd < 0 ? (
              <>
                and <strong className="font-medium">{worst.symbol}</strong> the weakest ({usd(worst.unrealizedPnlUsd)}).{" "}
              </>
            ) : (
              <>and every position is in the green right now. </>
            )}
          </>
        ) : null}
        We&apos;re {m.exposure.investedPct.toFixed(0)}% invested, {m.exposure.cashPct.toFixed(0)}% in cash.{" "}
        {openVotes > 0 ? (
          <>
            <strong className="font-medium">
              {openVotes} proposal{openVotes === 1 ? "" : "s"} {openVotes === 1 ? "is" : "are"} waiting on your vote.
            </strong>
          </>
        ) : (
          <>No proposals are open for a vote right now.</>
        )}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Chip label="Since launch" value={pct(m.portReturn)} tone={m.portReturn >= 0 ? "up" : "down"} />
        <Chip label="vs S&P 500" value={pct(m.alpha)} tone={ahead ? "up" : "down"} />
        <Chip label="Invested" value={`${m.exposure.investedPct.toFixed(0)}%`} />
        <Chip label="Open votes" value={String(openVotes)} />
        {openVotes > 0 && (
          <Link href="/proposals" className="text-xs font-medium text-accent hover:underline">
            Go vote →
          </Link>
        )}
      </div>

      {isSample && (
        <p className="mt-4 text-[11px] text-muted">
          Figures are the desk&apos;s sample book — they become live automatically once the brokerage is connected.
        </p>
      )}
    </section>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color =
    tone === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span className={`font-mono text-sm font-medium ${color}`}>{value}</span>
    </span>
  );
}
