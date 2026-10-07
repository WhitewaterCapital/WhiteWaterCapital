import { runDesk } from "../src/lib/live/desk";
import { challenge } from "../src/lib/live/challenge";
const [t, ...rest] = process.argv.slice(2);
const d = await runDesk(t);
if (!d) throw new Error("not found");
console.log(`${t}: desk says ${d.view.call} ${d.view.conviction}`);
const r = await challenge(d, rest.join(" "));
console.log(JSON.stringify({ read: r.read, facts: r.facts, whatIf: r.whatIf, sup: r.research.supporting.map((n) => n.title).slice(0, 3), con: r.research.contradicting.map((n) => n.title).slice(0, 3) }, null, 1));
console.log("\nANSWER:", r.answer);
