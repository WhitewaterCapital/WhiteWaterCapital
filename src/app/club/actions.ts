"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { clubCall } from "@/lib/club-store";
import { SITE } from "@/content/site";

// Server actions for the club's shared records. Every one re-checks the
// session (server actions are reachable by POST, independent of the page's
// proxy guard) and validates input before it reaches the database — the DB
// enforces the same constraints again.

const SYMBOL = /^[A-Z0-9.\-]{1,12}$/;

async function who(): Promise<string> {
  const m = await getCurrentMember();
  if (!m) redirect("/login");
  return m.name;
}

function back(path: string, err?: string): never {
  revalidatePath(path);
  redirect(err ? `${path}?error=${encodeURIComponent(err)}` : path);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createProposal(form: FormData) {
  const name = await who();
  const symbol = str(form, "symbol").toUpperCase();
  const side = str(form, "side");
  const amount = Number(str(form, "amount"));
  const currency = (str(form, "currency") || "EUR").toUpperCase();
  const thesis = str(form, "thesis");
  if (!SYMBOL.test(symbol)) back("/proposals", "Ticker should be letters/numbers, e.g. NVDA.");
  if (side !== "buy" && side !== "sell") back("/proposals", "Pick buy or sell.");
  if (!(amount > 0)) back("/proposals", "Enter a positive amount.");
  if (thesis.length < 10) back("/proposals", "Write the thesis — at least a sentence.");
  try {
    const id = await clubCall<string>("club_proposal_create", {
      p_symbol: symbol, p_side: side, p_amount: amount, p_currency: currency, p_thesis: thesis, p_author: name,
    });
    // The proposer votes yes by proposing.
    await clubCall("club_vote", { p_proposal: id, p_voter: name, p_value: "yes", p_members: SITE.memberCount });
  } catch (e) {
    back("/proposals", (e as Error).message);
  }
  back("/proposals");
}

export async function castVote(form: FormData) {
  const name = await who();
  const id = str(form, "id");
  const value = str(form, "value");
  if (value !== "yes" && value !== "no") back("/proposals", "Invalid vote.");
  try {
    await clubCall("club_vote", { p_proposal: id, p_voter: name, p_value: value, p_members: SITE.memberCount });
  } catch (e) {
    back("/proposals", (e as Error).message);
  }
  back("/proposals");
}

export async function markExecuted(form: FormData) {
  await who();
  try {
    await clubCall("club_proposal_set_status", { p_proposal: str(form, "id"), p_status: "executed" });
  } catch (e) {
    back("/proposals", (e as Error).message);
  }
  back("/proposals");
}

export async function addJournal(form: FormData) {
  const name = await who();
  const symbol = str(form, "symbol").toUpperCase();
  const action = str(form, "action");
  const reasoning = str(form, "reasoning");
  if (!SYMBOL.test(symbol)) back("/journal", "Ticker should be letters/numbers, e.g. NVDA.");
  if (!["buy", "add", "trim", "sell"].includes(action)) back("/journal", "Pick an action.");
  if (reasoning.length < 10) back("/journal", "Write the reasoning — at least a sentence.");
  try {
    await clubCall("club_journal_add", { p_symbol: symbol, p_action: action, p_reasoning: reasoning, p_author: name });
  } catch (e) {
    back("/journal", (e as Error).message);
  }
  back("/journal");
}

export async function setJournalOutcome(form: FormData) {
  await who();
  try {
    await clubCall("club_journal_set_outcome", { p_id: str(form, "id"), p_outcome: str(form, "outcome") });
  } catch (e) {
    back("/journal", (e as Error).message);
  }
  back("/journal");
}

export async function addWatch(form: FormData) {
  const name = await who();
  const symbol = str(form, "symbol").toUpperCase();
  if (!SYMBOL.test(symbol)) back("/watchlist", "Ticker should be letters/numbers, e.g. NVDA.");
  try {
    await clubCall("club_watch_add", { p_symbol: symbol, p_note: str(form, "note").slice(0, 1000), p_author: name });
  } catch (e) {
    back("/watchlist", (e as Error).message);
  }
  back("/watchlist");
}

export async function removeWatch(form: FormData) {
  await who();
  try {
    await clubCall("club_watch_remove", { p_symbol: str(form, "symbol") });
  } catch (e) {
    back("/watchlist", (e as Error).message);
  }
  back("/watchlist");
}
