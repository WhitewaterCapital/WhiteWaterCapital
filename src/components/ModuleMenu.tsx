"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES, CLUB_TOOLS } from "@/lib/modules";

// Second row of the members header: jump between modules and club tools
// without going back through the Desk. Highlights where you are; scrolls
// sideways on a phone instead of wrapping.
export function ModuleMenu() {
  const pathname = usePathname();
  const items = [{ href: "/dashboard", name: "Desk" }, ...MODULES, ...CLUB_TOOLS];
  return (
    <nav aria-label="Members sections" className="border-t border-hairline">
      <div className="mx-auto max-w-5xl overflow-x-auto px-6 [scrollbar-width:none]">
        <ul className="flex gap-5 whitespace-nowrap py-2.5 text-[11px] uppercase tracking-[0.12em]">
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "border-b border-accent pb-1 text-foreground"
                      : "text-muted hover:text-foreground"
                  }
                >
                  {it.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
