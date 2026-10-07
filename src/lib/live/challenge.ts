import "server-only";
import { deskView, type DeskResult, type ModelCard } from "./desk";
import { researchClaim, toneOf, type NewsItem } from "./news";

// ═══════════════════════════════════════════════════════════════════════════
// "Push back" — argue with the desk. FREE by default (no paid API, per the
// team's decision); Claude is an opt-in upgrade (CHALLENGE_ENGINE=claude +
// ANTHROPIC_API_KEY) that falls back to this engine on any failure.
//
//   1. read the point: which way it leans (bull/bear) and what it's about
//   2. fact-check it against the numbers the models actually use
//   3. research it: the last 30 days of coverage for the company + the point,
//      counting what backs it up and what cuts against it
//   4. re-run the desk view as if the point is right (scaled by how well the
//      research supports it) and say plainly whether the call changes
// Never invents a fact: every number comes from the desk result or a source.
// ═══════════════════════════════════════════════════════════════════════════

export type ChallengeReply = {
  engine: "rules" | "claude";
  read: { direction: "bullish" | "bearish" | "unclear"; topics: string[]; models: string[] };
  facts: string[];
  research: { supporting: NewsItem[]; contradicting: NewsItem[]; neutral: number; query: string[] };
  whatIf: { before: string; after: string; changed: boolean; beforeConviction: number; afterConviction: number } | null;
  answer: string; // the plain-language reply
};

type Topic = { id: string; label: string; model: string; words: RegExp };
const TOPICS: Topic[] = [
  { id: "valuation", label: "valuation", model: "fundamentals", words: /\b(valuation|overvalued|undervalued|cheap|expensive|pricey|multiple|p\/?e|priced in|bubble|rich)\b/i },
  { id: "health", label: "the balance sheet & profits", model: "fundamentals", words: /\b(debt|cash|margin|profit|balance sheet|dilution|buyback|revenue|sales|growth|guidance|cash flow|fcf|earnings power)\b/i },
  { id: "trend", label: "the price trend", model: "momentum", words: /\b(momentum|chart|breakout|rall(y|ies)|sell-?off|technical|support|resistance|trend|all-time high|oversold|overbought)\b/i },
  { id: "insiders", label: "insider activity", model: "momentum", words: /\b(insiders?|ceo (bought|sold|buying|selling)|management (bought|sold)|form 4)\b/i },
  { id: "analysts", label: "analysts & estimates", model: "analysts", words: /\b(analysts?|upgrade|downgrade|estimates?|consensus|price target|rating)\b/i },
  { id: "catalyst", label: "a catalyst", model: "analysts", words: /\b(earnings|quarter|beat|miss|fda|approval|contract|deal|acquisition|merger|lawsuit|launch|product|partnership|ai|order|customer)\b/i },
  { id: "macro", label: "the macro backdrop", model: "macro", words: /\b(fed|rates?|inflation|recession|tariffs?|china|oil|election|war|yields?|economy|consumer)\b/i },
];

const BULL = /\b(beat|raised?|raising|upgrade|strong|record|growing|accelerat|cheap|undervalued|oversold|buy(ing)?|bullish|won|wins|approval|approved|expand|better|upside|rebound|recover)/i;
const BEAR = /\b(miss|cut|cutting|downgrade|weak|slow|overvalued|expensive|bubble|sell(ing)?|bearish|lawsuit|probe|recall|loss|worse|downside|risk|competition|tariff|debt|dilut|crash|decline|falling)/i;
const STOP = new Set(
  "but the a an and or of to in on for with is are was were be been it its this that they we our you your i just about from at by as has have had not no do does did will would should could their there what which who more less very really so than then also into over under way too much many stock stocks shares company think saw seen see get got going still even now".split(" "),
);

function readClaim(text: string) {
  const b = (text.match(new RegExp(BULL, "gi")) ?? []).length;
  const r = (text.match(new RegExp(BEAR, "gi")) ?? []).length;
  const direction: ChallengeReply["read"]["direction"] = b > r ? "bullish" : r > b ? "bearish" : "unclear";
  // "150x earnings" / "20 times sales" is a VALUATION point, not an earnings
  // catalyst — strip multiples before topic matching.
  const multiple = /\b\d+(\.\d+)?\s*(x|times)\s*(earnings|sales|revenue|ebitda|book|fcf|free cash flow)\b/i;
  const textForTopics = multiple.test(text) ? `${text.replace(multiple, " ")} valuation` : text;
  const topics = TOPICS.filter((t) => t.words.test(textForTopics));
  const words = [...new Set(text.toLowerCase().replace(/[^a-z0-9$%.\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];
  // Prefer the words that carry the point (topic / bull / bear vocabulary).
  const meaningful = words.filter((w) => BULL.test(w) || BEAR.test(w) || TOPICS.some((t) => t.words.test(w)));
  const keywords = (meaningful.length ? meaningful : words).slice(0, 4);
  return { direction, topics, keywords };
}


function factsFor(topicIds: string[], d: DeskResult): string[] {
  const card = (id: string) => d.cards.find((c) => c.id === id);
  const rowsOf = (c: ModelCard | undefined, title: string) =>
    c?.breakdown.sections.find((s) => s.title.toLowerCase().startsWith(title.toLowerCase()))?.rows ?? [];
  const val = (c: ModelCard | undefined, sec: string, label: string) => rowsOf(c, sec).find((r) => r.label.startsWith(label))?.value ?? "—";
  const f = card("fundamentals");
  const out: string[] = [];
  for (const t of topicIds) {
    if (t === "valuation") {
      const vs = f?.breakdown.sections.find((s) => s.title.startsWith("Valuation"));
      out.push(`Valuation as the model sees it: ${vs?.title.replace("Valuation — ", "") ?? "—"} — earnings yield ${val(f, "Valuation", "Earnings yield")}, FCF yield ${val(f, "Valuation", "FCF yield")}, EV/Sales ${val(f, "Valuation", "EV / Sales")}.`);
    }
    if (t === "health") {
      out.push(`From the latest annual filing: revenue growth ${val(f, "Financial health", "Revenue growth")}, net margin ${val(f, "Financial health", "Net margin")}, FCF margin ${val(f, "Financial health", "FCF margin")}, long-term debt/assets ${val(f, "Financial health", "Leverage")}.`);
    }
    if (t === "trend") {
      out.push(`Price: ${d.stats.find((s) => s.label === "12-mo momentum")?.value} over 12 months; ${val(f, "Trend", "Distance to 52w high")} of its 52-week high; ${val(f, "Trend", "1-month return")} in the last month.`);
    }
    if (t === "insiders") {
      const m = card("momentum");
      out.push(`SEC Form 4, last 90 days: ${val(m, "Insider flow", "Open-market buys")} open-market buys, ${val(m, "Insider flow", "Open-market sells")} sells (planned sales excluded).`);
    }
    if (t === "analysts" || t === "catalyst") {
      const a = card("analysts");
      out.push(`Analysts: ${val(a, "Estimate revisions", "Revised up")} estimates raised vs ${val(a, "Estimate revisions", "Revised down")} cut in 4 weeks; next report ${d.earnings?.date ?? "—"} (consensus ${val(a, "Next earnings", "Consensus EPS")}); Street target ${val(a, "Street price target", "1-year target")}.`);
    }
    if (t === "macro") {
      const m = card("macro");
      out.push(`Macro: ${m?.breakdown.sections[0]?.title ?? "—"}. ${m?.headline ?? ""}`);
    }
  }
  return [...new Set(out)];
}

// Re-run the desk's weighted vote with the touched models nudged toward the
// user's side. Nudge = 0.15 base + up to 0.35 more as the research backs it.
function whatIf(d: DeskResult, models: string[], dir: number, support: number) {
  const voting = d.cards.filter((c) => c.available && c.weight > 0);
  if (!voting.length || !dir || !models.length) return null;
  const nudge = 0.15 + 0.35 * support;
  const shifted = voting.map((c) => ({
    weight: c.weight,
    direction: models.includes(c.id) ? Math.max(-1, Math.min(1, c.direction + dir * nudge)) : c.direction,
  }));
  const after = deskView(shifted); // the SAME math the page uses
  return {
    before: d.view.call,
    after: after.call,
    changed: d.view.call !== after.call,
    beforeConviction: d.view.conviction,
    afterConviction: after.conviction,
  };
}

export async function challenge(d: DeskResult, text: string): Promise<ChallengeReply> {
  const { direction, topics, keywords } = readClaim(text);
  const dir = direction === "bullish" ? 1 : direction === "bearish" ? -1 : 0;
  const models = [...new Set(topics.map((t) => t.model))];
  const found = await researchClaim(d.ticker, d.name, keywords);
  const supporting = found.filter((n) => (dir > 0 ? n.tone === "positive" : dir < 0 ? n.tone === "negative" : false));
  const contradicting = found.filter((n) => (dir > 0 ? n.tone === "negative" : dir < 0 ? n.tone === "positive" : false));
  const neutral = found.length - supporting.length - contradicting.length;
  const decided = supporting.length + contradicting.length;
  const support = decided ? supporting.length / decided : 0.5;
  const facts = factsFor(topics.map((t) => t.id), d);
  const wi = whatIf(d, models, dir, decided >= 3 ? support : 0.5);

  const topicWords = topics.map((t) => t.label);
  const parts: string[] = [];
  if (direction === "unclear") {
    parts.push(
      `I can't tell whether that's a bullish or a bearish point — say which way you think it cuts (e.g. "they raised guidance, that's bullish") and I'll re-run the call.`,
    );
  } else {
    parts.push(
      `I read that as a ${direction} point${topicWords.length ? ` about ${topicWords.join(" and ")}` : ""}${models.length ? `, which feeds the ${models.map((m) => d.cards.find((c) => c.id === m)?.name).join(" and ")} model${models.length > 1 ? "s" : ""}` : ""}.`,
    );
  }
  if (found.length) {
    const verdict =
      decided < 3
        ? "the coverage doesn't clearly lean either way"
        : support >= 0.65
          ? "the coverage backs you up"
          : support <= 0.35
            ? "the coverage mostly cuts against you"
            : "the coverage is split";
    parts.push(
      `In the last 30 days I found ${found.length} relevant headlines: ${supporting.length} support your read, ${contradicting.length} cut against it — ${verdict}.`,
    );
  } else {
    parts.push("I couldn't find recent coverage on that specific point, so it rests on the numbers alone.");
  }
  if (wi) {
    parts.push(
      wi.changed
        ? `If you're right, the desk moves from ${wi.before} to ${wi.after} (conviction ${wi.beforeConviction} → ${wi.afterConviction}). That's a real change: worth re-checking before acting.`
        : `Even granting your point, the desk stays ${wi.before} (conviction ${wi.beforeConviction} → ${wi.afterConviction}): ${
            Math.abs(wi.afterConviction - wi.beforeConviction) >= 8 ? "it moves the needle but doesn't flip the call" : "it isn't big enough to change the call"
          }. ${d.view.disagree.length ? `The pushback that would matter more is in ${d.view.disagree.join(" and ")}.` : ""}`.trim(),
    );
  } else if (direction !== "unclear" && !models.length) {
    parts.push("That point doesn't map onto anything the models measure, so I can't re-score it — but the research above is what's out there.");
  }

  const reply: ChallengeReply = {
    engine: "rules",
    read: { direction, topics: topicWords, models: models.map((m) => d.cards.find((c) => c.id === m)?.name ?? m) },
    facts,
    research: { supporting: supporting.slice(0, 5), contradicting: contradicting.slice(0, 5), neutral, query: keywords },
    whatIf: wi,
    answer: parts.join(" "),
  };

  // Optional Claude upgrade: a richer argument over the SAME facts.
  if (process.env.CHALLENGE_ENGINE === "claude" && process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: process.env.CHALLENGE_MODEL ?? "claude-sonnet-5",
          max_tokens: 700,
          system:
            "You are the research desk of a small investment club. A member is pushing back on the desk's call. Be decisive and specific; " +
            "use ONLY the facts and headlines provided — never invent numbers. Say whether their point changes the call and why, in under 180 words.",
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                ticker: d.ticker,
                desk: d.view,
                models: d.cards.map((c) => ({ name: c.name, call: c.call, conviction: c.conviction, why: c.headline })),
                member_says: text,
                facts,
                headlines_supporting: supporting.slice(0, 6).map((n) => n.title),
                headlines_against: contradicting.slice(0, 6).map((n) => n.title),
                what_if: wi,
              }),
            },
          ],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const t = j?.content?.find((c: { type: string }) => c.type === "text")?.text;
        if (t) return { ...reply, engine: "claude", answer: t };
      }
    } catch {
      /* fall back to the rules answer */
    }
  }
  return reply;
}

export { toneOf };
