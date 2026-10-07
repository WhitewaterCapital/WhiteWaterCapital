import { PublicPage, Prose } from "@/components/PublicPage";
import { SITE, contactLine } from "@/content/site";

export const metadata = {
  title: "Terms of use",
  description: "Terms for using the Whitewater website.",
};

// PUBLIC — Terms of use. Have counsel review; facts live in src/content/site.ts.
export default function TermsPage() {
  const who = SITE.legalEntity || SITE.name;
  return (
    <PublicPage eyebrow="Terms" title="Terms of use." intro={<p>Last updated {SITE.legalUpdated}.</p>}>
      <Prose>
        <p>By using this website you agree to these terms. If you don&apos;t agree, please don&apos;t use it.</p>

        <h2>Information only, not advice and not an offer</h2>
        <p>
          Everything here is general information about {who}. It is not investment, legal or tax
          advice, and not an offer to sell, or a solicitation of an offer to buy, any security or
          interest in any fund. Any such offer would only ever be made privately, through proper
          documents, and only where lawful.
        </p>

        <h2>Performance</h2>
        <p>
          Any performance shown is historical, may be unaudited, and is not a guarantee of future
          results. Investing involves risk, including the loss of capital.
        </p>

        <h2>Members area</h2>
        <p>
          The members area is for partners only. Don&apos;t try to access it without permission or
          share access with others.
        </p>

        <h2>Our content</h2>
        <p>
          The site&apos;s text, design and software belong to {who}. You may view and share links
          to it, but please don&apos;t copy or republish it without permission.
        </p>

        <h2>No warranty; limitation of liability</h2>
        <p>
          The site is provided &ldquo;as is&rdquo;. We don&apos;t promise it is accurate, complete or
          always available, and to the extent the law allows we are not liable for losses arising
          from its use.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of {SITE.jurisdiction || "the jurisdiction where we are established"}.
        </p>

        <h2>Contact</h2>
        <p>Questions about these terms: {contactLine()}.</p>
      </Prose>
    </PublicPage>
  );
}
