// Prints the equity read + Stress Test verdict for every name in the Incepta
// export, so you can sanity-check scores and conviction after a refresh.
// Run: npm run audit:equity
import { readFileSync } from "node:fs";
import { equityVerdict, financialHealth, valuationRead, trendRead, riskRead } from "../src/lib/models/equity-read";
import { distresse } from "../src/lib/models/impl/distresse";
const d = JSON.parse(readFileSync("public/data/incepta/latest.json", "utf8"));
for (const s of d.securities) {
  const ev = { quality: s.quality, valuation: s.valuation, risk: s.risk };
  const v = equityVerdict(ev);
  const L = await distresse.evaluate({ ticker: s.ticker, instrument: "long", evidence: ev } as any);
  const S = await distresse.evaluate({ ticker: s.ticker, instrument: "short", evidence: ev } as any);
  const f = (x: number | null) => (x == null ? "—" : x.toFixed(0));
  console.log(s.ticker.padEnd(5), "H", f(v.health.score), v.health.band, "| V", f(v.valuation.score), v.valuation.band, "| T", f(v.trend.score), v.trend.band, "| R", f(v.risk.score), "| cov", v.coverage.toFixed(2), "|| equity:", v.stance, v.conviction, "| stress long:", L.rating, L.conviction, "| short:", S.rating, S.conviction);
}
