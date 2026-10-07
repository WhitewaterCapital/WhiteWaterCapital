> **PARTLY DONE 2026-10-07:** the session cookie is HMAC-signed and carries the member's name
> (`src/lib/auth.ts`, `src/lib/session.ts` → `getCurrentMember()`). Remaining: real per-member Supabase
> logins with an approved-members allowlist, replacing the shared passcode + typed name.

# 01 · Real per-member login (Supabase Auth)

## Why
`src/lib/auth.ts` is a shared passcode (`letmein` by default), and its cookie (`hf_member`) is
**unsigned**: anyone can set the cookie in their browser and walk into the members area.
Replace it with real per-member accounts where only people James approves get in.

## Build
1. **Supabase Auth with email magic links** via `@supabase/ssr` (cookie-based sessions
   that work in `src/proxy.ts`, Server Components and Route Handlers). Env:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which already exist.
2. **Allowlist table** `members` (migration): `id uuid pk`, `email text unique not null`,
   `display_name text`, `role text check in ('admin','member') default 'member'`,
   `approved boolean default false`, `created_at timestamptz default now()`.
   RLS: a signed-in user can read only their own row, and nobody can write from the client.
   James approves people in the Supabase dashboard (document how in the PR).
3. **Proxy:** protected routes require a valid Supabase session AND an `approved=true`
   members row. Signed in but not approved → a friendly `/pending` page. Not signed in →
   `/login?next=<path>`.
4. **`/login`:** email field → "check your inbox" state. An auth callback route handles the
   magic-link return.
5. **Login → Desk transition:** a short entrance on `/dashboard` (the tiles already use
   `.rise`). Keep it tasteful and respect `prefers-reduced-motion`.
6. **`getCurrentMember()`** in `src/lib/auth.ts` returning `{ id, email, displayName, role }`
   or `null`, for other features to use (task 02 depends on this seam).
7. **Logout** (`/api/logout` already exists) signs out of Supabase.
8. **Fallback:** if `AUTH_MODE` is not `supabase`, keep the passcode gate working, but
   sign the cookie (HMAC with `AUTH_SECRET`) so it can't be forged. Default to the passcode
   gate so production keeps working until James flips `AUTH_MODE=supabase`.

## Done when
Build passes. The PR lists: the migration to apply, the env vars (`AUTH_MODE`, `AUTH_SECRET`),
the Supabase dashboard steps (enable email auth, set the Site URL / redirect URLs to the
Vercel domain), and how to approve a member.
