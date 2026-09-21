import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { Card } from "@/components/ui";
import { HowToRead, DemoNote } from "@/components/Explain";
import { watchlist } from "@/lib/sample-data";
import { shortDate } from "@/lib/format";

// WATCHLIST — the on-ramp between "a model flagged this" and "let's propose
// it". Names the club is keeping an eye on but doesn't own yet, each with a
// plain reason and who added it. The natural next step is a written proposal.
export const dynamic = "force-dynamic";

export default function WatchlistPage() {
  return (
    <div>
      <ModuleNav crumb="Watchlist" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// Watchlist</p>
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

        <div className="mt-4">
          <DemoNote>
            <strong className="font-semibold">Example list.</strong> A shared, editable watchlist saves to the
            account once a database is wired in; these entries show the format.
          </DemoNote>
        </div>

        <div className="mt-8 space-y-4">
          {watchlist.map((w) => (
            <Card key={w.symbol}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-lg font-semibold">{w.symbol}</h3>
                  <span className="text-xs text-muted">
                    added by {w.addedBy} · {shortDate(w.addedAt)}
                  </span>
                </div>
                <Link
                  href="/proposals"
                  className="whitespace-nowrap text-xs font-medium text-accent hover:underline"
                >
                  Propose it →
                </Link>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/85">{w.note}</p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
