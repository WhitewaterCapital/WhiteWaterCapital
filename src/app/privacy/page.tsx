import { PublicPage, Prose } from "@/components/PublicPage";
import { SITE, contactLine } from "@/content/site";

export const metadata = {
  title: "Privacy policy",
  description: "What Whitewater collects, why, and your rights.",
};

// PUBLIC — Privacy policy. Drafted to cover exactly what this site does
// (two forms, one login cookie, hosting logs). Have counsel review it; facts
// to fill live in src/content/site.ts.
export default function PrivacyPage() {
  const who = SITE.legalEntity || SITE.name;
  return (
    <PublicPage eyebrow="Privacy" title="Privacy policy." intro={<p>Last updated {SITE.legalUpdated}.</p>}>
      <Prose>
        <p>
          This policy explains what personal data {who} (&ldquo;we&rdquo;)
          {SITE.jurisdiction ? `, established in ${SITE.jurisdiction},` : ""} collects through this
          website, why, and the choices you have. We are the controller of that data.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Register-interest form</strong> (Invest page): your name, email, an optional
            note, and whether you self-report as an accredited investor.
          </li>
          <li>
            <strong>Newsletter sign-up:</strong> your email address.
          </li>
          <li>
            <strong>Members login:</strong> a single strictly-necessary cookie that keeps partners
            signed in. We use no advertising or analytics cookies.
          </li>
          <li>
            <strong>Technical logs:</strong> our hosting provider records standard request data (IP
            address, browser, time) to run and secure the site.
          </li>
        </ul>

        <h2>Why we use it, and on what basis</h2>
        <ul>
          <li>To reply to you and keep you informed about the club, because you asked us to (consent).</li>
          <li>To send the newsletter you signed up for (consent; unsubscribe any time).</li>
          <li>To operate and secure the site (our legitimate interest in running it safely).</li>
        </ul>
        <p>We never sell your data or share it for marketing.</p>

        <h2>Who processes it for us</h2>
        <ul>
          <li><strong>Supabase</strong>: stores form submissions (hosted in the United States).</li>
          <li><strong>Vercel</strong>: hosts the website and keeps request logs.</li>
        </ul>
        <p>
          Where data is transferred outside the EEA/UK, it relies on the providers&apos;
          standard contractual clauses.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Interest and newsletter records are kept until you ask us to delete them or unsubscribe,
          and reviewed at least yearly. Hosting logs are kept by Vercel for a short period.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask to access, correct, delete or export your data, object to or restrict its
          use, or withdraw consent at any time. Contact us at {contactLine()}. If you are in the
          EU/UK you may also complain to your data-protection authority.
        </p>

        <h2>Changes</h2>
        <p>If we change this policy we&apos;ll update the date at the top of this page.</p>
      </Prose>
    </PublicPage>
  );
}
