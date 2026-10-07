# What only the team can fill in

All of these live in **`src/content/site.ts`**. Edit, commit, push. Until a field is filled,
the site hides that section or uses neutral wording, so nothing half-done shows publicly.

| Field | What to put | Where it shows |
|---|---|---|
| `team` | One entry per partner: `name`, `role`, 1–3 sentence `bio`, optional `linkedin` | About page, "The partners" (hidden while empty) |
| `contactEmail` | A monitored inbox (e.g. a shared Gmail) | Contact page, Privacy policy, Terms |
| `legalEntity` | The club's legal name, e.g. "Whitewater Capital LLC" | Privacy (data controller), Terms, footer © |
| `jurisdiction` | Where the entity is registered, e.g. "Ireland" | Privacy, Terms (governing law) |
| `founded` | Year (default 2026) | About |
| `legalUpdated` | Date counsel signs off the policies | Privacy, Terms |

## In Vercel (Settings → Environment Variables, then Redeploy)

- **`MEMBER_PASSCODE`** (**required**): the shared members passcode. Production no longer
  falls back to `letmein`; without it, members login is disabled.
- `AUTH_SECRET` (optional): a long random string to sign sessions. Changing it, or the
  passcode, logs everyone out.
- `NEXT_PUBLIC_SITE_URL` (optional): set it if you move to a custom domain (used for link
  previews and the sitemap).

## Get a lawyer to read

`/privacy` and `/terms` are drafted to match what the site actually does: two forms, one
login cookie, Supabase + Vercel. They aren't legal advice. Have counsel review them,
especially before raising outside money.
