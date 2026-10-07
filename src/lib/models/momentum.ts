import "server-only";
import { getEquityExport, findSecurity } from "@/lib/incepta";

// A name's OWN price momentum, from the real Incepta export (Yahoo/Tiingo
// prices). 12-1 momentum = return over the last 12 months skipping the most
// recent month (Jegadeesh & Titman 1993; the standard academic definition —
// skipping month 1 avoids the short-term reversal effect).
//
// `tilt` maps it onto the -100..+100 signal scale: +/-50% 12-1 return
// saturates. (Linear, stated, not backtested — a scale, not a forecast.)
//
// Replaces the Mom FACTOR BETA the screens used before: a factor loading says
// how a stock co-moves with the winners-minus-losers portfolio (a style
// tilt), not whether the stock itself has been winning.

export type MomentumRead = { mom12_1: number; ret1m: number | null; tilt: number; asOf: string };

export async function ownMomentum(ticker: string): Promise<MomentumRead | { unavailable: string }> {
  const data = await getEquityExport();
  if (!data) return { unavailable: "Incepta export missing" };
  const s = findSecurity(data, ticker);
  const mom = s?.risk?.mom_12_1;
  if (!s || typeof mom !== "number" || !Number.isFinite(mom)) {
    return { unavailable: `no price history for ${ticker} in the Incepta export` };
  }
  const ret1m = typeof s.risk?.ret_1m === "number" ? s.risk.ret_1m : null;
  return { mom12_1: mom, ret1m, tilt: Math.max(-100, Math.min(100, mom * 200)), asOf: data.as_of };
}

// Combine insider flow and momentum into one signed score with an explicit
// rule (used by Smart Money and Earnings Move):
//   • both agree  → average, plus a 15% agreement bonus (two independent
//                    sources pointing the same way is stronger than either)
//   • they clash  → insider flow LEADS (it's the informed, event-specific
//                    signal), dampened by 30% for the disagreement
//   • one missing → the one we have
export function combineInsiderMomentum(ins: number | null, mom: number | null): number {
  const clamp = (n: number) => Math.max(-100, Math.min(100, Math.round(n)));
  if (ins != null && mom != null) {
    if (ins === 0) return clamp(mom);
    if (Math.sign(ins) === Math.sign(mom)) return clamp(((ins + mom) / 2) * 1.15);
    return clamp(ins * 0.7);
  }
  return clamp(ins ?? mom ?? 0);
}
