# Cloud task briefs — read this first

Each `0X-*.md` file in this folder is a self-contained task for a Claude Code cloud session.
Start a session with this prompt: **"Execute docs/cloud-tasks/0X-<name>.md"**.

## Ground rules (apply to every task)

- **This is a modified Next.js 16 (App Router, Turbopack).** Read the relevant guide in
  `node_modules/next/dist/docs/` before writing code (see `AGENTS.md`). Middleware is
  `src/proxy.ts`. `ssr:false` is forbidden in Server Components.
- **Branch and PR:** branch off `main` as `cloud/<task-name>`. Open a PR to `main` and
  **do not merge it**; James reviews. `npm run build` must pass, and `npx tsc --noEmit` must be clean.
- **Never commit secrets.** The repo is PUBLIC. `.env*` is gitignored. If a key is needed,
  read it from `process.env` and document the variable name in the PR.
- **No paid Anthropic/Claude API dependency.** The team declined API spend. Any AI-shaped
  feature must default to a free, deterministic path, with Claude as an opt-in flag.
- **No fabricated data.** Never show placeholder or synthetic numbers as real. Anything
  illustrative carries a visible label, and real-data paths abstain (`null` / "—") rather
  than guess.
- **Be decisive.** Models and reads make an actual call (long/short, go/no-go,
  escalating/stable) with a conviction level. Reserve "insufficient evidence" for things
  that genuinely don't matter to markets.
- **Members pages:** a new members-only route must be added to `PROTECTED` and the
  `matcher` in `src/proxy.ts`. If it's a module, also add a tile to `MODULES` in
  `src/app/dashboard/page.tsx`.
- **Supabase:** use project `four-and-co` (ref `qyvpxgnhkwkntnfiwafq`) only. Put schema
  changes in `supabase/migrations/<timestamp>_<name>.sql` and do NOT try to apply them.
  James applies them, so list them in the PR description. RLS on every table.
- **Club IBKR account:** EUR base currency, read-only via Flex (`src/lib/book.ts`). Don't change it.
- **Style:** match the surrounding code: small files, explanatory header comments,
  Tailwind with the existing tokens (`text-muted`, `border-hairline`, `.eyebrow`, `Card`/`Stat`
  from `src/components/ui.tsx`).
