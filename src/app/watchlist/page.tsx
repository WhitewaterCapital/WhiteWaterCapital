import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { Card } from "@/components/ui";
import { HowToRead, DemoNote } from "@/components/Explain";
import { readClub } from "@/lib/club-store";
import { getCurrentMember } from "@/lib/session";
import { addWatch, removeWatch } from "@/app/club/actions";
import { shortDate } from "@/lib/format";

// WATCHLIST — the on-ramp between "a model flagged this" and "let's propose
// it". Names the club is keeping an eye on but doesn't own yet, each with a
// plain reason and who added it. The natural next step is a written proposal.
export const dynamic = "force-dynamic";

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, club, me] = await Promise.all([searchParams, readClub(), getCurrentMember()]);
  const live = !club.isSample;
  return (
    <div>
      <ModuleNav crumb="Watchlist" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">{"// Watchlist"}</p>
          <span className="font-mono text-xs text-muted">on our radar</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Names we&apos;re watching.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Stocks the club is interested in but doesn&apos;t own yet — a shared radar, so an idea doesn&apos;t
          get lost between someone noticing it and the club deciding on it.
        </p>

        <div className="mt-6">
          <HowToRead>
            <p>
              • <strong className="font-medium text-foreground">These aren&apos;t positions</strong> — nothing here
              is owned. It&apos;s a shortlist of maybes.
            </p>
            <p>
              • <strong className="font-medium text-foreground">Anyone can add a name</strong> with a one-line
              reason, so we all see what each other is thinking about.
            </p>
            <p>
              • <strong className="font-medium text-foreground">Ready to act?</strong> Turn a watch into a written
              proposal the club votes on.
            </p>
          </HowToRead>
        </div>

        {club.isSample && (
          <div className="mt-4">
            <DemoNote>
              <strong className="font-semibold">Example list.</strong> {club.reason}
            </DemoNote>
          </div>
        )}
        {error && (
          <p className="mt-4 border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        {live && (
          <form action={addWatch} className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input name="symbol" required maxLength={12} placeholder="Ticker"
              className="border border-hairline bg-transparent px-3 py-2 text-sm uppercase outline-none focus:border-foreground/40 sm:w-32" />
            <input name="note" maxLength={1000} placeholder="Why we're watching it (one line)"
              className="flex-1 border border-hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40" />
            <button className="bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
              Add{me ? ` as ${me.name}` : ""}
            </button>
          </form>
        )}

        <div className="mt-8 space-y-4">
          {club.watchlist.length === 0 && <p className="text-sm text-muted">Nothing on the radar yet.</p>}
          {club.watchlist.map((w) => (
            <Card key={w.symbol}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-lg font-semibold">{w.symbol}</h3>
                  <span className="text-xs text-muted">
                    added by {w.added_by} · {shortDate(w.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <Link
                    href="/proposals"
                    className="whitespace-nowrap text-xs font-medium text-accent hover:underline"
                  >
                    Propose it →
                  </Link>
                  {live && (
                    <form action={removeWatch}>
                      <input type="hidden" name="symbol" value={w.symbol} />
                      <button className="text-xs text-muted hover:text-rose-500">Remove</button>
                    </form>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/85">{w.note}</p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
