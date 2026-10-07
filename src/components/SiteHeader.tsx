import Link from "next/link";

// Public site header. `overlay` sits transparently over the home page's
// gradient hero; `solid` is the hairline-bordered bar used everywhere else.
const LINKS = [
  { href: "/about", label: "About" },
  { href: "/#track-record", label: "Track Record", hideOnMobile: true },
  { href: "/invest", label: "Invest" },
];

export function SiteHeader({ variant = "solid" }: { variant?: "overlay" | "solid" }) {
  const overlay = variant === "overlay";
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-10" : "border-b border-hairline"}>
      <div
        className={`mx-auto flex max-w-5xl items-center justify-between px-6 ${
          overlay ? "py-5 text-white" : "py-4"
        }`}
      >
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.18em]">
          Whitewater
        </Link>
        <nav
          className={`flex items-center gap-5 text-xs uppercase tracking-[0.12em] sm:gap-6 ${
            overlay ? "text-white/80" : "text-muted"
          }`}
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`${l.hideOnMobile ? "hidden sm:inline" : ""} ${
                overlay ? "hover:text-white" : "hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            className={`rounded-full border px-4 py-1.5 ${
              overlay
                ? "border-white/40 hover:border-white"
                : "border-foreground/25 hover:border-foreground/50 hover:text-foreground"
            }`}
          >
            Members
          </Link>
        </nav>
      </div>
    </header>
  );
}
