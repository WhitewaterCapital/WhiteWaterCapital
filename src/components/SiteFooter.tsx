import Link from "next/link";
import { SITE } from "@/content/site";

// Public site footer — same on every public page.
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col justify-between gap-6 sm:flex-row">
          <div>
            <span className="text-sm font-semibold uppercase tracking-[0.18em]">Whitewater</span>
            <p className="mt-2 max-w-xs text-xs text-muted">{SITE.tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-xs uppercase tracking-[0.12em] text-muted">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/invest" className="hover:text-foreground">Invest</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
            <Link href="/dashboard" className="hover:text-foreground">Members</Link>
          </div>
        </div>
        <p className="mt-8 max-w-2xl text-xs text-muted">
          Positions and holdings are private to members. Past performance is not indicative of
          future results. Nothing on this site is investment advice or an offer to sell, or a
          solicitation of an offer to buy, any security.
        </p>
        <p className="mt-3 text-xs text-muted">
          © {year} {SITE.legalEntity || SITE.name}
        </p>
      </div>
    </footer>
  );
}
