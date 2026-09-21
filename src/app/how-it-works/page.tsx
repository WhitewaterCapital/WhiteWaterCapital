import Link from "next/link";
import { ModuleNav } from "@/components/ModuleNav";
import { Card } from "@/components/ui";

// HOW THIS CLUB WORKS — the onboarding page a new member (or a busy existing
// one) can read start to finish and understand the whole thing: the pooled
// account, unit accounting, voting, and what every model on the Desk is for.
// Content only — links out to the real pages rather than duplicating them.
export const dynamic = "force-dynamic";

const MODELS: { href: string; name: string; line: string }[] = [
  { href: "/trade-ideas", name: "Trade Ideas", line: "A shortlist of names our models flagged this week — the place to start a conversation." },
  { href: "/weekly", name: "Weekly Ranking", line: "Ranks our universe best-to-worst for the week ahead." },
  { href: "/smart-money", name: "Smart Money", line: "Where insiders and momentum are leaning, name by name." },
  { href: "/kalman", name: "Kalman Pairs", line: "Pairs of stocks that usually move together but have drifted apart." },
  { href: "/earnings", name: "Earnings Move", line: "Who reports earnings next, and how the desk is positioned going in." },
  { href: "/sentiment", name: "Sentimentum", line: "The top-down macro and market-regime read." },
  { href: "/stress-test", name: "Stress Test", line: "Pressure-tests a specific idea — the devil's-advocate read before we commit." },
  { href: "/performance", name: "Performance", line: "Where our return actually came from, vs. the S&P 500." },
];

export default function HowItWorksPage() {
  return (
    <div>
      <ModuleNav crumb="How it works" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-baseline gap-3">
          <p className="font-mono text-sm text-accent">// How it works</p>
          <span className="font-mono text-xs text-muted">start here</span>
        </div>
        <h1 className="display mt-2 text-3xl sm:text-4xl">How this club works.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Everything you need to take part — no finance background required. Five minutes here and
          you&apos;ll understand the whole thing.
        </p>

        <div className="mt-8 space-y-6">
          <Card title="The idea">
            <p className="text-sm leading-relaxed text-foreground/85">
              We pool our money into <strong className="font-medium">one shared brokerage account</strong> and
              invest it together, with one goal: beat the S&amp;P 500 over time. A handful of positions we can each
              understand and defend — not a random basket. Every position starts as a written argument the group
              votes on.
            </p>
          </Card>

          <Card title="Units — the fair way to share one pot">
            <p className="text-sm leading-relaxed text-foreground/85">
              Because we put money in at different times, we track ownership in <strong className="font-medium">units</strong>,
              like shares of a tiny fund. When you contribute, you buy units at that day&apos;s unit value; when you
              take money out, you sell units at that day&apos;s value. That way, someone who joined early never has
              their gains diluted by a later deposit, and nobody can accidentally benefit at another member&apos;s
              expense. Your stake is simply how many units you hold.
            </p>
            <Link href="/members" className="mt-4 inline-block text-xs font-medium text-accent hover:underline">
              See who owns what →
            </Link>
          </Card>

          <Card title="Proposals & voting — shared money, shared decisions">
            <p className="text-sm leading-relaxed text-foreground/85">
              Shared capital means shared calls. Anyone can propose a trade with a written thesis — why we&apos;d
              buy or sell, and how much. The group votes. If it passes, the desk places the trade by hand through
              our broker. And a rule we hold ourselves to:{" "}
              <strong className="font-medium">if the thesis breaks, the position goes</strong> — no exceptions.
            </p>
            <Link href="/proposals" className="mt-4 inline-block text-xs font-medium text-accent hover:underline">
              See open proposals →
            </Link>
          </Card>

          <Card title="The models — helpers, not autopilots">
            <p className="text-sm leading-relaxed text-foreground/85">
              The Desk has a set of models that <strong className="font-medium">surface ideas and pressure-test
              them</strong>. None of them places a trade — they suggest and inform; the club still decides and votes
              on everything. Here&apos;s what each one is for:
            </p>
            <ul className="mt-4 space-y-3">
              {MODELS.map((m) => (
                <li key={m.href} className="border-t border-hairline pt-3 first:border-t-0 first:pt-0">
                  <Link href={m.href} className="text-sm font-medium hover:text-accent">
                    {m.name} →
                  </Link>
                  <p className="mt-0.5 text-sm text-muted">{m.line}</p>
                </li>
              ))}
            </ul>
            <Link href="/glossary" className="mt-4 inline-block text-xs font-medium text-accent hover:underline">
              Any word you don&apos;t know? The glossary →
            </Link>
          </Card>

          <Card title="What's real, and what's a preview">
            <p className="text-sm leading-relaxed text-foreground/85">
              We&apos;re honest about this everywhere on the site: while we connect the live brokerage and market
              feeds, some numbers are clearly-labeled <strong className="font-medium">example data</strong> so you
              can see everything working. Anything marked that way is a preview of the machinery, never a real
              position or a number to trade on — and it switches to live automatically once the real accounts are
              wired in.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
