"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { recentTickers } from "./SearchBox";

// Recently viewed tickers (this device only).
export function RecentChips() {
  const [recent, setRecent] = useState<string[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read device storage once after mount
  useEffect(() => setRecent(recentTickers()), []);
  if (!recent.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Recent</span>
      {recent.map((s) => (
        <Link key={s} href={`/t/${encodeURIComponent(s)}`} className="rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-xs hover:border-foreground/40">
          {s}
        </Link>
      ))}
    </div>
  );
}
