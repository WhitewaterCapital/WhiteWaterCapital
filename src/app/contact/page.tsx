import Link from "next/link";
import { PublicPage } from "@/components/PublicPage";
import { SITE } from "@/content/site";

export const metadata = {
  title: "Contact",
  description: "How to reach Whitewater.",
};

// PUBLIC — Contact. Shows the team inbox once SITE.contactEmail is set;
// until then it routes people to the Invest form, which reaches the team.
export default function ContactPage() {
  return (
    <PublicPage eyebrow="Contact" title="Get in touch.">
      <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2">
        <div className="bg-background p-7">
          <h2 className="font-semibold">General &amp; press</h2>
          {SITE.contactEmail ? (
            <a href={`mailto:${SITE.contactEmail}`} className="mt-2 inline-block text-accent hover:underline">
              {SITE.contactEmail}
            </a>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Leave a note through the <Link href="/invest" className="text-accent hover:underline">Invest page</Link>{" "}
              form and a partner will reply personally.
            </p>
          )}
        </div>
        <div className="bg-background p-7">
          <h2 className="font-semibold">Investing with us</h2>
          <p className="mt-2 text-sm text-muted">
            Use the <Link href="/invest" className="text-accent hover:underline">register-interest form</Link>. It
            isn&apos;t an offer; it just lets us reach out once we can talk properly.
          </p>
        </div>
      </div>
      <p className="mt-8 text-xs text-muted">
        Privacy requests (access, correction, deletion): see our{" "}
        <Link href="/privacy" className="text-accent hover:underline">privacy policy</Link>.
      </p>
    </PublicPage>
  );
}
