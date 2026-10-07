import { ModuleNav } from "@/components/ModuleNav";
import { Card, Badge } from "@/components/ui";
import { DemoNote } from "@/components/Explain";
import { readClub, type ClubProposal } from "@/lib/club-store";
import { getCurrentMember } from "@/lib/session";
import { SITE } from "@/content/site";
import { money, shortDate } from "@/lib/format";
import { createProposal, castVote, markExecuted } from "@/app/club/actions";

// PROPOSALS — trade ideas + voting. Shared capital means shared decisions.
// Stored in the club database (src/lib/club-store.ts). A proposal is approved
// at a strict majority of SITE.memberCount yes votes and rejected once a
// majority is out of reach; the proposer's yes is counted automatically.
export const dynamic = "force-dynamic";

const STATUS_TONE = { open: "warn", approved: "up", rejected: "down", executed: "neutral" } as const;

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, club, me] = await Promise.all([searchParams, readClub(), getCurrentMember()]);
  const total = SITE.memberCount;
  const need = Math.floor(total / 2) + 1;
  const open = club.proposals.filter((p) => p.status === "open");
  const decided = club.proposals.filter((p) => p.status !== "open");

  return (
    <div>
      <ModuleNav crumb="Proposals" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="font-mono text-sm text-accent">{"// Proposals"}</p>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Pitch it, argue it, vote it.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          A written thesis before any trade. A proposal passes with {need} of {total} yes votes and is rejected as
          soon as {need} can no longer be reached.
        </p>

        {club.isSample && (
          <div className="mt-4">
            <DemoNote>
              <strong className="font-semibold">Example proposals.</strong> {club.reason}
            </DemoNote>
          </div>
        )}
        {error && (
          <p className="mt-4 border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}

        {!club.isSample && (
          <Card title="New proposal">
            <form action={createProposal} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_0.7fr]">
              <input name="symbol" required placeholder="Ticker (e.g. NVDA)" maxLength={12}
                className="border border-hairline bg-transparent px-3 py-2 text-sm uppercase outline-none focus:border-foreground/40" />
              <select name="side" className="border border-hairline bg-transparent px-3 py-2 text-sm">
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
              <input name="amount" required type="number" min="1" step="any" placeholder="Amount"
                className="border border-hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40" />
              <select name="currency" defaultValue="EUR" className="border border-hairline bg-transparent px-3 py-2 text-sm">
                <option>EUR</option>
                <option>USD</option>
              </select>
              <textarea name="thesis" required minLength={10} maxLength={4000} rows={3}
                placeholder="The thesis — why, why now, and what would prove it wrong."
                className="border border-hairline bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 sm:col-span-4" />
              <div className="flex items-center justify-between sm:col-span-4">
                <span className="text-xs text-muted">Proposing as {me?.name ?? "—"} (counts as your yes vote)</span>
                <button className="bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
                  Propose
                </button>
              </div>
            </form>
          </Card>
        )}

        <section className="mt-8">
          <h2 className="eyebrow mb-3">Open for a vote ({open.length})</h2>
          {open.length === 0 && <p className="text-sm text-muted">Nothing open right now.</p>}
          <div className="space-y-4">
            {open.map((p) => (
              <ProposalCard key={p.id} p={p} total={total} need={need} me={me?.name} live={!club.isSample} />
            ))}
          </div>
        </section>

        {decided.length > 0 && (
          <section className="mt-10">
            <h2 className="eyebrow mb-3">Decided</h2>
            <div className="space-y-4">
              {decided.map((p) => (
                <ProposalCard key={p.id} p={p} total={total} need={need} me={me?.name} live={!club.isSample} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ProposalCard({
  p,
  total,
  need,
  me,
  live,
}: {
  p: ClubProposal;
  total: number;
  need: number;
  me?: string;
  live: boolean;
}) {
  const yes = p.votes.filter((v) => v.value === "yes");
  const no = p.votes.filter((v) => v.value === "no");
  const mine = me ? p.votes.find((v) => v.voter.toLowerCase() === me.toLowerCase())?.value : undefined;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={p.side === "buy" ? "up" : "down"}>{p.side.toUpperCase()}</Badge>
          <span className="text-lg font-semibold">{p.symbol}</span>
          <span className="text-sm text-muted">{money(p.target_amount, p.currency)}</span>
        </div>
        <Badge tone={STATUS_TONE[p.status]}>
          {p.status === "open" ? `${yes.length}/${need} yes needed` : p.status}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground/85">{p.thesis}</p>
      <p className="mt-2 text-xs text-muted">
        Proposed by {p.proposed_by} · {shortDate(p.created_at)}
      </p>
      <p className="mt-2 text-xs text-muted">
        Yes: {yes.map((v) => v.voter).join(", ") || "—"} · No: {no.map((v) => v.voter).join(", ") || "—"} ·{" "}
        {Math.max(0, total - p.votes.length)} not voted
      </p>

      {live && p.status === "open" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {(["yes", "no"] as const).map((v) => (
            <form key={v} action={castVote}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="value" value={v} />
              <button
                className={`px-3 py-1.5 text-sm font-medium ${
                  v === "yes"
                    ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25"
                    : "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                } ${mine === v ? "ring-1 ring-current" : ""}`}
              >
                {mine === v ? `Voted ${v}` : `Vote ${v}`}
              </button>
            </form>
          ))}
          {mine && <span className="text-xs text-muted">You can change your vote while it&apos;s open.</span>}
        </div>
      )}
      {live && p.status === "approved" && (
        <form action={markExecuted} className="mt-4">
          <input type="hidden" name="id" value={p.id} />
          <button className="border border-foreground/25 px-3 py-1.5 text-xs uppercase tracking-wide text-muted hover:text-foreground">
            Mark as executed
          </button>
        </form>
      )}
    </Card>
  );
}
