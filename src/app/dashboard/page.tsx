import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";
import { ModuleNav } from "@/components/ModuleNav";
import { SearchBox } from "@/components/desk/SearchBox";
import { RecentChips } from "@/components/desk/RecentChips";
import { readClub } from "@/lib/club-store";
import { getCurrentMember } from "@/lib/session";

// THE DESK — one search bar. Type any stock; the ticker desk runs every model
// on it. Underneath: what's recent, what's on the club's radar, and a short
// read of the market today. Everything else lives one click away in the header.
export const dynamic = "force-dynamic";

type Macro = {
  as_of: string;
  regime: string;
  summary: string;
  sectors: { sector: string; etf: string; sentiment: number }[];
  catalysts: { date: string; event: string; importance: string }[];
};
type Aurora = { as_of: string; regime: { label: string | null; confidence: string } | null };

async function readJson<T>(rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", rel), "utf8")) as T;
  } catch {
    return null;
  }
}

const QUICK = ["SPY", "QQQ", "NVDA", "AAPL", "MSFT", "JPM"];

export default async function DeskPage() {
  const [me, club, macro, aurora] = await Promise.all([
    getCurrentMember(),
    readClub(),
    readJson<Macro>("macro-tracker/latest.json"),
    readJson<Aurora>("aurora/latest.json"),
  ]);
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }));
  const greet = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const radar = club.isSample ? [] : club.watchlist.map((w) => w.symbol);
  const openVotes = club.isSample ? 0 : club.proposals.filter((p) => p.status === "open").length;
  const sorted = [...(macro?.sectors ?? [])].sort((a, b) => b.sentiment - a.sentiment);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (macro?.catalysts ?? []).filter((c) => c.date >= today).slice(0, 4);

  return (
    <div className="min-h-screen">
      <ModuleNav search={false} />
      <main className="mx-auto max-w-6xl px-5 sm:px-6">
        <section className="glow flex flex-col items-center pb-14 pt-20 text-center sm:pt-28">
          <p className="eyebrow fade-up">
            {greet}
            {me ? `, ${me.name.split(" ")[0]}` : ""}
          </p>
          <h1 className="serif fade-up mt-3 text-5xl leading-[1.05] sm:text-7xl" style={{ animationDelay: "60ms" }}>
            What are we looking at?
          </h1>
          <p className="fade-up mt-4 max-w-lg text-muted" style={{ animationDelay: "120ms" }}>
            Any stock. Every model runs on it live — fundamentals, momentum, insiders, analysts, macro — with the news and
            one clear call.
          </p>
          <div className="fade-up mt-10 flex w-full justify-center" style={{ animationDelay: "180ms" }}>
            <SearchBox autoFocus />
          </div>
          <div className="mt-6 flex flex-col items-center gap-3">
            <RecentChips />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted">{radar.length ? "On our radar" : "Try"}</span>
              {(radar.length ? radar : QUICK).slice(0, 8).map((s) => (
                <Link key={s} href={`/t/${encodeURIComponent(s)}`} className="rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-xs hover:border-foreground/40">
                  {s}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-3">
          <div className="surface rounded-2xl p-5 md:col-span-2">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">The market today</p>
              <span className="font-mono text-[11px] text-muted">{macro?.as_of ?? "—"}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground/85">{macro?.summary ?? "Macro read not refreshed yet."}</p>
            {aurora?.regime?.label && (
              <p className="mt-3 text-sm">
                <span className="text-muted">Macro regime:</span> <span className="font-medium">{aurora.regime.label}</span>{" "}
                <span className="text-xs text-muted">({aurora.regime.confidence} confidence, Aurora)</span>
              </p>
            )}
            {sorted.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {sorted.map((s) => (
                  <Link
                    key={s.etf}
                    href={`/t/${s.etf}`}
                    className={`rounded-full px-2.5 py-1 ${s.sentiment >= 0 ? "bg-long/10 text-long" : "bg-short/10 text-short"}`}
                    title={`${s.etf} vs the S&P 500`}
                  >
                    {s.sector} {s.sentiment > 0 ? "+" : ""}
                    {s.sentiment}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="surface rounded-2xl p-5">
            <p className="eyebrow">Coming up</p>
            <ul className="mt-3 space-y-2.5">
              {upcoming.length ? (
                upcoming.map((c) => (
                  <li key={c.date + c.event} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{c.event}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{c.date.slice(5)}</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted">Nothing scheduled.</li>
              )}
            </ul>
            <div className="mt-5 border-t border-hairline pt-4 text-sm">
              {openVotes > 0 ? (
                <Link href="/proposals" className="font-medium text-accent hover:underline">
                  {openVotes} proposal{openVotes === 1 ? "" : "s"} waiting on your vote →
                </Link>
              ) : (
                <Link href="/book" className="text-muted hover:text-foreground">
                  See the book →
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
