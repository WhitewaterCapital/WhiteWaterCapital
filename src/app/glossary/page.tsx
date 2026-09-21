import { ModuleNav } from "@/components/ModuleNav";
import { TERMS } from "@/lib/explain";

// GLOSSARY — one plain-English home for every term the model pages use, so a
// member never has to already know the vocabulary. Reads the same TERMS the
// <Term> hover tooltips read, so a definition can never drift between here and
// the page it appears on.
export const dynamic = "force-dynamic";

export default function GlossaryPage() {
  const entries = Object.entries(TERMS).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <ModuleNav crumb="Glossary" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// Glossary</p>
          <span className="font-mono text-xs text-muted">plain English</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Every term, in plain English.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          The desk&apos;s pages try to explain themselves as you read, but here&apos;s the whole
          vocabulary in one place. Each term gets a plain definition and why it matters — no prior
          finance background assumed.
        </p>

        <dl className="mt-8 divide-y divide-hairline border-t border-hairline">
          {entries.map(([term, { def, why }]) => (
            <div key={term} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="text-sm font-semibold capitalize">{term}</dt>
              <dd className="text-sm leading-relaxed text-foreground/85">
                {def}
                <span className="mt-1.5 block text-muted">
                  <span className="font-medium text-foreground/70">Why it matters: </span>
                  {why}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-xs text-muted">
          Missing a term? It should be defined wherever it appears (look for the dotted underline —
          hover or tap it). If one isn&apos;t, that&apos;s a gap worth flagging.
        </p>
      </main>
    </div>
  );
}
