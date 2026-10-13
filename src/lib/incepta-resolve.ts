import "server-only";
import { getEquityExport, findSecurity } from "@/lib/incepta";
import { analyzeTicker } from "@/lib/live/analyze";
import type { SecurityAnalysis } from "@/lib/models/incepta-export";

// ---------------------------------------------------------------------------
// Resolve a single security to real evidence, shared by the equity analyze
// route and the stress route:
//   1) the published Incepta universe (instant)
//   2) the LIVE engine (src/lib/live): SEC XBRL + Yahoo prices, computed in
//      TypeScript — works for any listed ticker, on Vercel too. (This used to
//      shell out to the Python engine, which only worked on a local machine,
//      so non-universe tickers failed in production.)
// ---------------------------------------------------------------------------

// Only real tickers — also prevents any argument/shell mischief.
export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function usable(s: SecurityAnalysis | null): boolean {
  return Boolean(s && (s.data_quality.has_prices || s.data_quality.has_fundamentals));
}

export type Resolution =
  | { status: "ok"; source: "universe" | "engine" | "live"; security: SecurityAnalysis; livePrice?: number | null }
  | { status: "invalid" | "unavailable"; message: string };

// Universe-only lookup (never shells out). Safe on Vercel. Used to attach
// evidence without paying the engine cost.
export async function resolveFromUniverse(ticker: string): Promise<SecurityAnalysis | null> {
  const t = ticker.trim().toUpperCase();
  const published = await getEquityExport();
  if (!published) return null;
  return findSecurity(published, t) ?? null;
}

// Full resolution — LIVE FIRST (fix 2026-10): the live engine has today's
// prices; the published universe is a daily snapshot whose prices go stale
// intraday (and on the live site were weeks old). The universe is only the
// fallback when a live fetch fails.
export async function resolveSecurity(ticker: string): Promise<Resolution> {
  const t = ticker.trim().toUpperCase();
  if (!TICKER_RE.test(t)) {
    return { status: "invalid", message: "Enter a valid ticker (letters/numbers)." };
  }
  const live = await analyzeTicker(t);
  if (live && usable(live.security)) {
    return { status: "ok", source: "live", security: live.security, livePrice: live.quote.price };
  }
  const fromUniverse = await resolveFromUniverse(t);
  if (fromUniverse) return { status: "ok", source: "universe", security: fromUniverse };
  return {
    status: "unavailable",
    message: `No listed stock found for ${t} — check the ticker (or search by company name on the Desk).`,
  };
}
