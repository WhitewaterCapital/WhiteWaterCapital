# 04 · Clean-up: lint to zero + consensus chat on real macro

## Build
1. **Lint to zero:** `npx eslint src` reports errors, mostly
   `react/jsx-no-comment-textnodes` from the `// Eyebrow` design labels. Keep the visual
   design: wrap them as `{"// The Desk"}` (or equivalent). Fix any other errors properly
   rather than disabling rules.
2. **Consensus chat on real data:** `src/app/api/chat/route.ts` feeds the bot
   `primaryMacro().read()`, which comes from `src/lib/models/impl/macro-tracker.ts`, an
   **RNG "(sample)" reading**. Repoint it at the real Aurora macro export (`src/lib/aurora.ts`,
   `public/data/aurora/latest.json`, and the existing "macro call" synthesis used by
   `src/components/MacroReader.tsx`).
3. The chat must work with **no paid API**: build a free deterministic responder that
   answers from the real macro call (regime, biggest tailwind/headwind, scenario tags) with
   a decisive stance, keyword-routed. Keep the Claude path behind `aiEnabled()` as opt-in only.
4. Remove the RNG macro tracker from anything user-facing, or label it clearly if it must stay.

## Done when
`npx eslint src` exits 0, the build passes, and `/api/chat` answers from real Aurora data
with no API key set.
