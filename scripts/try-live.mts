// Quick live check: npx tsx scripts/try-live.mts TICKER [TICKER…]
import { analyzeTicker } from "../src/lib/live/analyze";
import { equityVerdict } from "../src/lib/models/equity-read";
for (const t of process.argv.slice(2)) {
  const a = await analyzeTicker(t);
  if (!a) { console.log(t, "→ not found"); continue; }
  const s = a.security, q = s.quality, v = s.valuation, r = s.risk;
  const f = (x: number | null | undefined, p = 1) => (x == null ? "—" : (x * 100).toFixed(p) + "%");
  console.log(`${t.padEnd(6)} ${s.name?.slice(0, 26).padEnd(26)} px ${a.quote.price} ${s.confidence} fy ${q?.period_end ?? "—"} ${a.fundamentals?.currency ?? ""}`);
  console.log(`   roa ${f(q?.roa)} nm ${f(q?.net_margin)} fcf ${f(q?.fcf_margin)} lev ${q?.leverage?.toFixed(2) ?? "—"} g ${f(q?.rev_growth)} pio ${q?.piotroski_f}/${q?.piotroski_max} | mc ${v?.market_cap ? (v.market_cap / 1e9).toFixed(1) + "B" : "—"} pe ${v?.pe?.toFixed(1) ?? "—"} pb ${v?.pb?.toFixed(1) ?? "—"} fcfy ${f(v?.fcf_yield)} ev/s ${v?.ev_sales?.toFixed(2) ?? "—"}`);
  console.log(`   mom ${f(r?.mom_12_1, 0)} vol ${f(r?.realized_vol, 0)} beta ${r?.beta_mkt?.toFixed(2)} spread ${r?.spread_bps?.toFixed(0)}bp flags ${[...s.data_quality.flags, ...(v?.flags ?? [])].join("; ") || "none"}`);
  const vd = equityVerdict({ quality: s.quality, valuation: s.valuation, risk: s.risk });
  console.log(`   => ${vd.stance} ${vd.conviction}  (H ${vd.health.score?.toFixed(0)} V ${vd.valuation.score?.toFixed(0)} T ${vd.trend.score?.toFixed(0)})`);
}
