// Daily closes from Yahoo's free chart endpoint (no key) — SPY for the
// benchmark, and `<CCY>USD=X` FX to re-express SPY in a non-USD base currency.
// Returns a date → close map; empty on failure so the book still renders
// (the UI then shows "—" for anything benchmark-relative instead of guessing).

export async function yahooCloses(symbol: string, fromIso: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const period1 = Math.floor(new Date(`${fromIso}T00:00:00Z`).getTime() / 1000) - 7 * 86400;
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return out;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const close: (number | null)[] =
      r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
    ts.forEach((t, i) => {
      const c = close[i];
      if (c != null && Number.isFinite(c) && c > 0) {
        // Shift into New York time so the stamp lands on the trading date.
        out.set(new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10), c);
      }
    });
  } catch {
    /* unavailable — caller degrades */
  }
  return out;
}

// SPY total-return closes expressed in `currency` (USD → as-is; EUR → SPY / EURUSD).
// A EUR book is compared with what a EUR investor would have earned holding SPY.
export async function spyCloses(fromIso: string, currency = "USD"): Promise<Map<string, number>> {
  const spy = await yahooCloses("SPY", fromIso);
  if (currency === "USD" || !spy.size) return spy;
  const fx = await yahooCloses(`${currency}USD=X`, fromIso); // USD per 1 unit of base
  if (!fx.size) return new Map();
  const fxDates = [...fx.keys()].sort();
  const out = new Map<string, number>();
  let fi = 0;
  let rate = NaN;
  for (const d of [...spy.keys()].sort()) {
    while (fi < fxDates.length && fxDates[fi] <= d) rate = fx.get(fxDates[fi++])!;
    if (Number.isFinite(rate)) out.set(d, spy.get(d)! / rate);
  }
  return out;
}
