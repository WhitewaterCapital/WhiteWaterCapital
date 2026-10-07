import Link from "next/link";
import { PublicPage } from "@/components/PublicPage";
import { SITE } from "@/content/site";

export const metadata = {
  title: "About",
  description: "Who we are and how Whitewater invests.",
};

// PUBLIC — About. The team section renders only once SITE.team is filled in
// (src/content/site.ts) so the page never shows placeholder people.
export default function AboutPage() {
  const team = SITE.team;
  return (
    <PublicPage
      eyebrow="About"
      title="A small group, one shared book."
      intro={
        <p>
          Whitewater is an investment club: a handful of partners who pool their own capital into
          one account, argue every position in writing, and hold ourselves to a single scorecard,
          the S&amp;P 500. Founded {SITE.founded}.
        </p>
      }
    >
      <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
        {[
          ["Pooled, fairly", "Capital is tracked in units like a small fund, so deposits at different times never dilute anyone."],
          ["Written theses", "Every position starts as a written argument the partners vote on, and is exited when the thesis breaks."],
          ["Built in-house", "Our research desk (macro regime, stress tests, entry/exit levels, conflict risk) is software we wrote ourselves."],
        ].map(([t, b]) => (
          <div key={t} className="bg-background p-6">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-2 text-sm text-muted">{b}</p>
          </div>
        ))}
      </div>

      {team.length > 0 && (
        <section className="mt-14">
          <p className="eyebrow">The partners</p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {team.map((m) => (
              <div key={m.name} className="border-t border-hairline pt-4">
                <h3 className="text-lg font-semibold">{m.name}</h3>
                <p className="text-xs uppercase tracking-[0.12em] text-muted">{m.role}</p>
                <p className="mt-2 text-sm text-foreground/85">{m.bio}</p>
                {m.linkedin && (
                  <a href={m.linkedin} className="mt-2 inline-block text-xs text-accent hover:underline" rel="noopener noreferrer" target="_blank">
                    LinkedIn →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-14 text-sm text-muted">
        Want to hear more? <Link href="/invest" className="text-accent hover:underline">Register interest</Link> or{" "}
        <Link href="/contact" className="text-accent hover:underline">get in touch</Link>.
      </p>
    </PublicPage>
  );
}
