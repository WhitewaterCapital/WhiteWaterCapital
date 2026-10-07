import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  proposals as sampleProposals,
  members as sampleMembers,
  journal as sampleJournal,
  watchlist as sampleWatch,
} from "./sample-data";

// ---------------------------------------------------------------------------
// The club's shared records — proposals + votes, decision journal, watchlist —
// stored in Supabase (migration supabase/migrations/20261007120000_club_store.sql).
//
// Every call goes through SECURITY DEFINER functions gated on CLUB_API_SECRET,
// a server-only env var (never NEXT_PUBLIC). The tables themselves deny all
// direct access, so the public anon key alone can read nothing.
//
// Not configured or unreachable → the example data, flagged `isSample` with
// the reason, so the pages keep working and say so plainly.
// ---------------------------------------------------------------------------

export type ClubVote = { voter: string; value: "yes" | "no"; at: string };
export type ClubProposal = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  target_amount: number;
  currency: string;
  thesis: string;
  proposed_by: string;
  status: "open" | "approved" | "rejected" | "executed";
  created_at: string;
  votes: ClubVote[];
};
export type ClubJournalEntry = {
  id: string;
  symbol: string;
  action: "buy" | "add" | "trim" | "sell";
  reasoning: string;
  outcome: string | null;
  author: string;
  created_at: string;
};
export type ClubWatch = { symbol: string; note: string; added_by: string; created_at: string };

export type ClubData = {
  isSample: boolean;
  reason?: string;
  proposals: ClubProposal[];
  journal: ClubJournalEntry[];
  watchlist: ClubWatch[];
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.CLUB_API_SECRET;
  if (!url || !key || !secret) return null;
  return { db: createClient(url, key, { auth: { persistSession: false } }), secret };
}

export function clubStoreConfigured(): boolean {
  return client() !== null;
}

function sample(reason: string): ClubData {
  const name = (id: string) => sampleMembers.find((m) => m.id === id)?.name ?? id;
  return {
    isSample: true,
    reason,
    proposals: sampleProposals.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      target_amount: p.targetUsd,
      currency: "USD",
      thesis: p.thesis,
      proposed_by: name(p.proposedBy),
      status: p.status,
      created_at: p.createdAt,
      votes: p.votes.map((v) => ({ voter: name(v.memberId), value: v.value, at: v.at })),
    })),
    journal: sampleJournal.map((j) => ({
      id: j.id,
      symbol: j.symbol,
      action: j.action,
      reasoning: j.thesis,
      outcome: j.status === "closed" ? j.review : null,
      author: j.championedBy,
      created_at: j.date,
    })),
    watchlist: sampleWatch.map((w) => ({ symbol: w.symbol, note: w.note, added_by: w.addedBy, created_at: w.addedAt })),
  };
}

export async function readClub(): Promise<ClubData> {
  const c = client();
  if (!c) return sample("The shared club database isn't connected yet (CLUB_API_SECRET not set).");
  // Bounded: a paused/unreachable project must not hang the page.
  const { data, error } = await c.db.rpc("club_read", { p_secret: c.secret }).abortSignal(AbortSignal.timeout(6000));
  if (error || !data) {
    return sample(`The club database couldn't be reached (${error?.message ?? "no data"}) — showing examples.`);
  }
  const d = data as Omit<ClubData, "isSample">;
  return { isSample: false, proposals: d.proposals ?? [], journal: d.journal ?? [], watchlist: d.watchlist ?? [] };
}

// Low-level mutation; throws with a readable message on failure.
export async function clubCall<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = client();
  if (!c) throw new Error("The club database isn't connected yet.");
  const { data, error } = await c.db.rpc(fn, { p_secret: c.secret, ...args }).abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error(error.message);
  return data as T;
}
