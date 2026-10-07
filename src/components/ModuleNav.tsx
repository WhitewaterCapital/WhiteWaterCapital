import Link from "next/link";
import { SearchBox } from "./desk/SearchBox";
import { MODULES, CLUB_TOOLS } from "@/lib/modules";

// Members header — deliberately small: the brand (→ Desk), a search box, and
// three destinations. The research modules and club tools sit in dropdowns so
// the page itself stays the focus.
export function ModuleNav({ crumb, search = true }: { crumb?: string; search?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-[13px] font-semibold text-background">W</span>
          <span className="hidden text-sm font-semibold uppercase tracking-[0.16em] sm:inline">Whitewater</span>
        </Link>
        {crumb && <span className="hidden truncate text-xs text-muted md:inline">/ {crumb}</span>}
        <div className="ml-auto hidden items-center gap-1 sm:flex sm:gap-2">
          {search && (
            <div className="hidden md:block">
              <SearchBox variant="compact" />
            </div>
          )}
          <Link href="/dashboard" className="rounded-full px-3 py-1.5 text-sm text-foreground/80 hover:bg-paper hover:text-foreground">
            Desk
          </Link>
          <Link href="/book" className="rounded-full px-3 py-1.5 text-sm text-foreground/80 hover:bg-paper hover:text-foreground">
            Book
          </Link>
          <Menu label="Club" items={CLUB} />
          <Menu label="Research" items={RESEARCH} />
          <form action="/api/logout" method="post">
            <button className="ml-1 rounded-full border border-hairline px-3 py-1.5 text-xs text-muted hover:text-foreground">Log out</button>
          </form>
        </div>

        {/* Phones: search lives on the Desk; everything else in one menu. */}
        <div className="ml-auto flex items-center gap-1 sm:hidden">
          <Link href="/dashboard" aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-muted">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <details className="group relative">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full border border-hairline [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <div className="absolute right-0 z-50 mt-2 max-h-[75vh] w-64 overflow-y-auto rounded-2xl border border-hairline bg-surface py-2 shadow-[var(--shadow)]">
              {[{ href: "/dashboard", name: "Desk" }, { href: "/book", name: "Book" }].map((it) => (
                <Link key={it.href} href={it.href} className="block px-4 py-2 text-sm font-medium hover:bg-paper">
                  {it.name}
                </Link>
              ))}
              <p className="eyebrow px-4 pb-1 pt-3">Club</p>
              {CLUB.map((it) => (
                <Link key={it.href} href={it.href} className="block px-4 py-2 text-sm text-foreground/85 hover:bg-paper">
                  {it.name}
                </Link>
              ))}
              <p className="eyebrow px-4 pb-1 pt-3">Research</p>
              {RESEARCH.map((it) => (
                <Link key={it.href} href={it.href} className="block px-4 py-2 text-sm text-foreground/85 hover:bg-paper">
                  {it.name}
                </Link>
              ))}
              <form action="/api/logout" method="post" className="mt-2 border-t border-hairline px-4 pt-2">
                <button className="py-1.5 text-sm text-muted">Log out</button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

const CLUB = CLUB_TOOLS.filter((t) => t.href !== "/performance").map((t) => ({ href: t.href, name: t.name }));
const RESEARCH = [...MODULES.map((m) => ({ href: m.href, name: m.name })), { href: "/performance", name: "Performance" }];

function Menu({ label, items }: { label: string; items: { href: string; name: string }[] }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-1.5 text-sm text-foreground/80 hover:bg-paper hover:text-foreground [&::-webkit-details-marker]:hidden">
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" className="transition group-open:rotate-180" aria-hidden>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </summary>
      <ul className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-hairline bg-surface py-1.5 shadow-[var(--shadow)]">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="block px-4 py-2 text-sm text-foreground/85 hover:bg-paper hover:text-foreground">
              {it.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
