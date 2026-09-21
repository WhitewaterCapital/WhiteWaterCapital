import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { Card, Badge } from "@/components/ui";
import { HowToRead, DemoNote } from "@/components/Explain";
import { journal, type JournalEntry, type JournalAction } from "@/lib/sample-data";
import { shortDate } from "@/lib/format";

// DECISION JOURNAL — the club's decision loop made visible: every position and
// past decision keeps the written thesis it started as, who championed it, and
// an honest "how it aged" review. Open entries are the "why we own this" for
// the current holdings; closed entries show the discipline actually working.
export const dynamic = "force-dynamic";

const actionTone: Record<JournalAction, "up" | "down" | "neutral" | "warn"> = {
  buy: "up",
  add: "up",
  trim: "warn",
  sell: "down",
};
const actionWord: Record<JournalAction, string> = {
  buy: "Bought",
  add: "Added",
  trim: "Trimmed",
  sell: "Sold",
};

export default function JournalPage() {
  const open = journal.filter((e) => e.status === "open");
  const closed = journal.filter((e) => e.status === "closed");

  return (
    <div>
      <ModuleNav crumb="Decision journal" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// Decision Journal</p>
          <span className="font-mono text-xs text-muted">thesis in, review out</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Every decision, and how it aged.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Our one rule: a written thesis before a trade, and if the thesis breaks, the position goes. This is where
          those theses live — so we can see whether the reasons we bought are still true, and be honest with
          ourselves about the ones that didn&apos;t work.
        </p>

        <div className="mt-6">
          <HowToRead>
            <p>
              • <strong className="font-medium text-foreground">Open positions</strong> show why we own them today —
              the original argument, and whether it still holds.
            </p>
            <p>
              • <strong className="font-medium text-foreground">Closed decisions</strong> get an honest review — did
              the reasoning hold up, separate from whether we got lucky?
            </p>
            <p>
              • <strong className="font-medium text-foreground">It&apos;s a memory, not a scoreboard.</strong> The
              point is to learn from our own calls, good and bad.
            </p>
          </HowToRead>
        </div>

        <div className="mt-4">
          <DemoNote>
            <strong className="font-semibold">Example entries.</strong> These illustrate the format; real entries
            will flow from proposals and executed trades once those are wired to the account.
          </DemoNote>
        </div>

        <section className="mt-8">
          <h2 className="eyebrow mb-4">Open positions — why we own them</h2>
          <div className="space-y-4">
            {open.map((e) => (
              <EntryCard key={e.id} e={e} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="eyebrow mb-4">Closed — how they aged</h2>
          <div className="space-y-4">
            {closed.map((e) => (
              <EntryCard key={e.id} e={e} />
            ))}
          </div>
        </section>

        <p className="mt-8 text-xs text-muted">
          Considering a new name?{" "}
          <Link href="/proposals" className="font-medium text-accent hover:underline">
            Write it up as a proposal →
          </Link>
        </p>
      </main>
    </div>
  );
}

function EntryCard({ e }: { e: JournalEntry }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{e.symbol}</h3>
          <Badge tone={actionTone[e.action]}>{actionWord[e.action]}</Badge>
          <span className="text-xs text-muted">
            {shortDate(e.date)} · championed by {e.championedBy}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
        <span className="font-medium text-muted">Thesis: </span>
        {e.thesis}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/75">
        <span className="font-medium text-muted">{e.status === "open" ? "Where it stands: " : "How it aged: "}</span>
        {e.review}
      </p>
    </Card>
  );
}
