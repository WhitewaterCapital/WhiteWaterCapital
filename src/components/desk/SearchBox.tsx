"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = { symbol: string; name: string; exchange: string; type: string };

const RECENT_KEY = "ww:recent-tickers";
export function rememberTicker(sym: string) {
  try {
    const cur: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    localStorage.setItem(RECENT_KEY, JSON.stringify([sym, ...cur.filter((s) => s !== sym)].slice(0, 8)));
  } catch {
    /* storage unavailable — fine */
  }
}
export function recentTickers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// The one search bar: ticker OR company name → the ticker desk.
export function SearchBox({ variant = "hero", autoFocus = false }: { variant?: "hero" | "compact"; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) return; // empty box: suggestions are hidden by `shown` below
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (r.ok) {
          setHits((await r.json()).results ?? []);
          setOpen(true);
          setActive(-1);
        }
      } catch {
        /* aborted / offline */
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    setOpen(false);
    rememberTicker(s);
    router.push(`/t/${encodeURIComponent(s)}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // A highlighted suggestion wins; otherwise an exact symbol match; else
      // treat what was typed as a ticker.
      const exact = hits.find((h) => h.symbol.toUpperCase() === q.trim().toUpperCase());
      go(active >= 0 ? hits[active].symbol : exact?.symbol ?? (hits.length && !/^[A-Za-z.\-]{1,6}$/.test(q.trim()) ? hits[0].symbol : q));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const shown = q.trim() ? hits : [];
  const hero = variant === "hero";
  return (
    <div ref={box} className={`relative ${hero ? "w-full max-w-2xl" : "w-56 sm:w-72"}`}>
      <div
        className={`flex items-center gap-3 rounded-full border border-hairline bg-surface transition focus-within:border-foreground/40 ${
          hero ? "px-6 py-4 shadow-[var(--shadow)]" : "px-4 py-1.5"
        }`}
      >
        <svg width={hero ? 20 : 14} height={hero ? 20 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => hits.length && setOpen(true)}
          autoFocus={autoFocus}
          placeholder={hero ? "Search any stock — ticker or company" : "Search a stock"}
          aria-label="Search a stock by ticker or company name"
          role="combobox"
          aria-expanded={open}
          aria-controls="ticker-suggestions"
          autoComplete="off"
          spellCheck={false}
          className={`w-full bg-transparent outline-none placeholder:text-muted/80 ${hero ? "text-lg" : "text-sm"}`}
        />
        {busy && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-foreground/60" aria-label="Loading" />}
        {hero && !busy && (
          <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">Enter</kbd>
        )}
      </div>

      {open && shown.length > 0 && (
        <ul
          id="ticker-suggestions"
          role="listbox"
          className={`absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[var(--shadow)] fade-up ${hero ? "" : "min-w-72"}`}
        >
          {shown.map((h, i) => (
            <li key={h.symbol} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h.symbol)}
                className={`flex w-full items-baseline gap-3 px-5 py-3 text-left transition ${i === active ? "bg-paper" : ""}`}
              >
                <span className="w-16 shrink-0 font-mono text-sm font-semibold">{h.symbol}</span>
                <span className="truncate text-sm text-foreground/80">{h.name}</span>
                <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-muted">
                  {h.type === "ETF" ? "ETF · " : ""}
                  {h.exchange}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
