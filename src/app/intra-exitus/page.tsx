import { ModuleNav } from "@/components/ModuleNav";
import { Card } from "@/components/ui";
import { HowToRead, DemoNote } from "@/components/Explain";
import { IntraExitusReader } from "@/components/IntraExitusReader";
import { getIntraExitusExport } from "@/lib/intra-exitus";

// INTRA / EXITUS — entry & exit. Renders the REAL engine output
// (intra-exitus-engine → public/data/intra-exitus/latest.json). Honest "not
// synced" state when the engine hasn't exported; no fake levels.
export const dynamic = "force-dynamic";

export default async function IntraExitusPage() {
  const data = await getIntraExitusExport();

  return (
    <div>
      <ModuleNav crumb="Intra / Exitus" />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// Intra / Exitus</p>
          <span className="font-mono text-xs text-muted">enter · exit</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">
          Where to get in, where to get out.
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          For each name: a committed side (long or short), exactly where to get in, where
          you&apos;re wrong (the stop), where to take profit, and how big to size. A plan you can act on,
          not a shrug.
        </p>

        <div className="mt-6">
          <HowToRead>
            <p>
              • <strong className="font-medium text-foreground">Each card is a trade plan</strong> — the direction,
              an entry zone, a stop (where the idea is wrong), and profit targets.
            </p>
            <p>
              • <strong className="font-medium text-foreground">&ldquo;Actionable&rdquo; vs &ldquo;watch&rdquo;</strong>{" "}
              tells you whether the setup is live now or worth waiting for a better price.
            </p>
            <p>
              • <strong className="font-medium text-foreground">The stop is the point.</strong> It&apos;s where you
              admit the idea failed and step out — decided before you enter, not in the moment.
            </p>
          </HowToRead>
        </div>

        <div className="mt-4">
          <DemoNote>
            <strong className="font-semibold">Illustrative levels.</strong> Prices and levels are synthetic-demo
            until the live feed is connected — they show how a plan is built, not a live setup to trade.
          </DemoNote>
        </div>

        <div className="mt-8">
          {data ? (
            <IntraExitusReader data={data} />
          ) : (
            <Card>
              <p className="eyebrow">Not synced yet</p>
              <p className="mt-2 text-sm text-foreground/80">
                The engine hasn&apos;t exported. Run{" "}
                <code>python -m ie.export</code> in{" "}
                <code>intra-exitus-engine/</code> to populate{" "}
                <code>public/data/intra-exitus/latest.json</code>.
              </p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
