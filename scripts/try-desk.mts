// npx tsx scripts/try-desk.mts TICKER… — prints the desk view and each model card.
import { runDesk } from "../src/lib/live/desk";
for (const t of process.argv.slice(2)) {
  const t0 = Date.now();
  const d = await runDesk(t);
  if (!d) { console.log(t, "not found"); continue; }
  console.log(`\n${d.ticker} ${d.name} $${d.quote.price} (${d.industry}) — ${d.view.call} ${d.view.conviction} [score ${d.view.score.toFixed(2)}] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  ${d.view.summary}`);
  for (const c of d.cards) console.log(`  · ${c.name.padEnd(20)} ${String(c.call ?? "n/a").padEnd(10)} ${String(c.conviction).padStart(3)}  dir ${c.direction.toFixed(2).padStart(5)}  ${c.headline.slice(0, 110)}`);
  if (d.plan) console.log(`  plan: ${d.plan.bias} entry ${d.plan.entryZone} stop ${d.plan.stop} targets ${d.plan.targets}`);
}
