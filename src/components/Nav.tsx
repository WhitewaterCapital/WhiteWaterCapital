import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/proposals", label: "Proposals" },
];

// Top bar for the members area, with a logout action.
export function Nav({ fundName = "Four & Co." }: { fundName?: string }) {
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="text-sm font-semibold uppercase tracking-[0.18em]"
          >
            {fundName}
          </Link>
          <nav className="hidden gap-6 text-xs uppercase tracking-[0.12em] text-muted sm:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.12em]">
          <Link href="/" className="text-muted hover:text-foreground">
            Public
          </Link>
          <form action="/api/logout" method="post">
            <button className="border border-foreground/25 px-3 py-1 text-muted hover:text-foreground hover:border-foreground/50">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
