# Club store: proposals, votes, journal, watchlist

Saved in the Supabase project **four-and-co**. Until it's connected, the pages show example data with
a note saying why.

## Switch it on (one time)

1. **Restore the project** if it's paused: supabase.com → four-and-co → *Restore project*.
2. **Apply the migration** `supabase/migrations/20261007120000_club_store.sql` (SQL editor → paste → Run, or
   ask Claude to apply it).
3. **Register the server secret.** `CLUB_API_SECRET` is already in `hf/.env.local`. Store its SHA-256 hash in
   the database (Claude can do this; the hash is safe to share, the secret isn't):
   ```sql
   insert into public.club_config(key, value) values ('api_secret_sha256', '<sha256 hex of CLUB_API_SECRET>')
   on conflict (key) do update set value = excluded.value;
   ```
4. **Vercel:** add `CLUB_API_SECRET` (same value as `.env.local`) → Redeploy.
5. **GitHub (optional, recommended):** repo → Settings → Secrets → Actions: add `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so the daily workflow pings the database and it never pauses again.

## How it's secured

The tables have row-level security with **no policies**, so the public anon key (visible in every
browser) can't read or write them. The server calls `SECURITY DEFINER` functions that first check
`CLUB_API_SECRET` against its hash. Tickers and theses never reach a non-member.

## Rules built in

- A proposal passes at a strict majority of `memberCount` (3 of 5) yes votes, and is rejected as soon as
  that's out of reach. The proposer's yes is counted automatically. You can change your vote while a
  proposal is open.
- Names come from the members login ("Your name"): attribution within a trusted group, not proof of
  identity. Per-member logins (cloud task 01) will replace it.
