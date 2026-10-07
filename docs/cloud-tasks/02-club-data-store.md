> **DONE 2026-10-07** in `feat/layout-and-model-audit`: see `docs/CLUB_STORE.md`. Don't run this task.

# 02 · Make the club's tools real (proposals, votes, journal, watchlist)

## Why
`/proposals`, `/journal` and `/watchlist` read hard-coded arrays from
`src/lib/sample-data.ts` and say "Example list". Members should be able to actually propose,
vote, journal decisions and keep a shared watchlist.

## Build
1. **Migrations** (Supabase, RLS on): `proposals` (symbol, side buy/sell, target_amount,
   currency default 'EUR', thesis, proposed_by, status open/approved/rejected/executed,
   created_at), `votes` (proposal_id, member_id, value yes/no, unique per member+proposal),
   `journal_entries` (symbol, decision, reasoning, outcome nullable, author, created_at),
   `watchlist` (symbol unique, note, added_by, created_at).
   RLS: only signed-in approved members can read and write. Match `members` from task 01,
   or reference `auth.uid()` and leave a clear TODO if task 01 hasn't merged.
2. **Data layer** `src/lib/club-store.ts` with typed functions, plus a fallback to the
   existing sample arrays when Supabase isn't configured. In fallback mode, keep the
   "Example list" label.
3. **Server Actions** for: create proposal, cast/change vote, close proposal (admin),
   add journal entry, add/remove watchlist symbol. Validate input server-side.
4. **Identity:** use `getCurrentMember()` from `src/lib/auth.ts`. If it doesn't exist yet,
   create that function returning `null`, and treat `null` as "read-only" in the UI.
5. **Vote rule:** a proposal is approved when yes-votes > half of approved members. Show
   the tally and who has or hasn't voted.
6. Update `StateOfBook` (`src/components/StateOfBook.tsx`) so the "N proposals waiting on
   your vote" line reads the real store.

## Done when
Build passes. Sample-mode pages render exactly as before when Supabase env is missing. The
PR lists the migrations to apply.
