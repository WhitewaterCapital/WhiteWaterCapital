import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { Card, Badge } from "@/components/ui";
import { HowToRead, DemoNote } from "@/components/Explain";
import { readClub, type ClubJournalEntry } from "@/lib/club-store";
import { getCurrentMember } from "@/lib/session";
import { addJournal, setJournalOutcome } from "@/app/club/actions";
import { shortDate } from "@/lib/format";

type JournalAction = ClubJournalEntry["action"];

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

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, club, me] = await Promise.all([searchParams, readClub(), getCurrentMember()]);
  const open = club.journal.filter((e) => !e.outcome);
  const closed = club.journal.filter((e) => e.outcome);
  const live = !club.isSample;

  return (
    <div>
      <ModuleNav crumb="Decision journal" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">{"// Decision Journal"}</p>
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

        {club.isSample && (
          <div className="mt-4">
            <DemoNote>
              <strong className="font-semibold">Example entries.</strong> {club.reason}
            </DemoNote>
          </div>
        )}
        {error && (
          <p className="mt-4 border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}

        {live && (
          <div className="mt-6">
            <Card title="Log a decision">
              <form action={addJournal} className="grid gap-3 sm:grid-cols-2">
                <input name="symbol" required maxLength={12} placeholder="Ticker"
                  className="border border-hairline bg-transparent px-3 py-2 text-sm uppercase outline-none focus:border-foreground/40" />
                <select name="action" className="border border-hairline bg-transparent px-3 py-2 text-sm">
                  <option value="buy">Bought</option>
                  <option value="add">Added</option>
                  <option value="trim">Trimmed</option>
                  <option value="sell">Sold</option>
                </select>
                <textarea name="reasoning" required minLength={10} maxLength={4000} rows={3}
                  placeholder="The thesis at the time — what you believed and what would prove it wrong."
                  className="border border-hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 sm:col-span-2" />
                <div className="flex items-center justify-between sm:col-span-2">
                  <span className="text-xs text-muted">Logging as {me?.name ?? "—"}</span>
                  <button className="bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">Save</button>
                </div>
              </form>
            </Card>
          </div>
        )}

        <section className="mt-8">
          <h2 className="eyebrow mb-4">Open positions — why we own them</h2>
          <div className="space-y-4">
            {open.length === 0 && <p className="text-sm text-muted">No open decisions logged yet.</p>}
            {open.map((e) => (
              <EntryCard key={e.id} e={e} live={live} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="eyebrow mb-4">Closed — how they aged</h2>
          <div className="space-y-4">
            {closed.length === 0 && <p className="text-sm text-muted">Nothing reviewed yet.</p>}
            {closed.map((e) => (
              <EntryCard key={e.id} e={e} live={live} />
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

function EntryCard({ e, live }: { e: ClubJournalEntry; live: boolean }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{e.symbol}</h3>
          <Badge tone={actionTone[e.action]}>{actionWord[e.action]}</Badge>
          <span className="text-xs text-muted">
            {shortDate(e.created_at)} · championed by {e.author}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
        <span className="font-medium text-muted">Thesis: </span>
        {e.reasoning}
      </p>
      {e.outcome ? (
        <p className="mt-2 text-sm leading-relaxed text-foreground/75">
          <span className="font-medium text-muted">How it aged: </span>
          {e.outcome}
        </p>
      ) : live ? (
        <form action={setJournalOutcome} className="mt-3 flex gap-2">
          <input type="hidden" name="id" value={e.id} />
          <input name="outcome" maxLength={4000} placeholder="Closed it? Write how the thesis aged…"
            className="flex-1 border border-hairline bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40" />
          <button className="border border-foreground/25 px-3 py-1.5 text-xs uppercase tracking-wide text-muted hover:text-foreground">
            Review
          </button>
        </form>
      ) : null}
    </Card>
  );
}
