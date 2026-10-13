// End-to-end smoke test of every page and backend route.
//   BASE=http://localhost:3100 PASSCODE=… npx tsx scripts/smoke.mts
// Logs in, then checks: HTTP status, error text on the page, leftover
// synthetic/sample markers, response time, and the age of every data export.
import { readFileSync, readdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const PASS = process.env.PASSCODE ?? "";
let cookie = "";
const fails: string[] = [];
const warns: string[] = [];

async function req(path: string, init: RequestInit = {}) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { redirect: "manual", ...init, headers: { cookie, ...(init.headers ?? {}) } });
  const body = await res.text();
  return { res, body, ms: Date.now() - t0 };
}

// ── login ──
if (PASS) {
  const form = new URLSearchParams({ name: "Smoke Test", passcode: PASS, next: "/dashboard" });
  const r = await fetch(BASE + "/api/login", { method: "POST", body: form, redirect: "manual" });
  const set = r.headers.get("set-cookie") ?? "";
  cookie = set.split(";")[0];
  console.log(`login: ${r.status} → ${r.headers.get("location")} cookie=${cookie ? "yes" : "NO"}`);
  if (!cookie) fails.push("login: no session cookie");
}

const ERR = /(Application error|Internal Server Error|This page hit an error|Unhandled Runtime Error|TypeError:|ReferenceError:|NaN%|\bundefined\b(?![-\w])|Infinity)/;
const STALE = /(synthetic-demo|SYNTHETIC|Sample data — not|Example proposals|isn't connected yet)/;

const pages = [
  "/", "/about", "/contact", "/privacy", "/terms", "/invest", "/login",
  "/dashboard", "/book", "/t/AAPL", "/t/ON", "/t/BRK-B", "/t/TSM", "/t/SOFI", "/t/ZZZZZQ",
  "/sentiment", "/stress-test", "/war-map", "/intra-exitus", "/weekly", "/kalman", "/earnings",
  "/smart-money", "/trade-ideas", "/performance", "/proposals", "/journal", "/watchlist",
  "/members", "/models", "/glossary", "/how-it-works", "/nova",
];
for (const p of pages) {
  const { res, body, ms } = await req(p);
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const err = ERR.exec(visible)?.[0];
  // Glossary defines "synthetic-demo"; the Book is labelled sample until IBKR is funded.
  const stale = p === "/glossary" ? undefined : STALE.exec(visible)?.[0];
  const ok = res.status === 200 || (p === "/nova" && res.status >= 300 && res.status < 400);
  const line = `${String(res.status).padEnd(4)} ${String(ms).padStart(6)}ms  ${p}${err ? `  ERROR TEXT: "${err}"` : ""}${stale ? `  STALE: "${stale}"` : ""}`;
  console.log(line);
  if (!ok || err) fails.push(line);
  else if (stale) warns.push(line);
  if (ms > 15000) warns.push(`slow: ${p} ${ms}ms`);
}

// ── APIs ──
const json = async (path: string, init?: RequestInit, check?: (j: any) => string | null) => {
  const { res, body, ms } = await req(path, init);
  let j: any = null;
  try { j = JSON.parse(body); } catch { /* not json */ }
  const problem = res.status >= 400 ? `HTTP ${res.status}` : !j ? "not JSON" : check ? check(j) : null;
  const line = `${String(res.status).padEnd(4)} ${String(ms).padStart(6)}ms  ${init?.method ?? "GET"} ${path}${problem ? `  PROBLEM: ${problem}` : ""}`;
  console.log(line);
  if (problem) fails.push(line);
  return j;
};
const post = (b: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

await json("/api/search?q=palantir", undefined, (j) => (j.results?.[0]?.symbol === "PLTR" ? null : "PLTR not first"));
await json("/api/models/equity/analyze", post({ ticker: "CRWD" }), (j) => (j.status === "ok" ? null : j.message));
await json("/api/models/stress", post({ ticker: "AAPL", instrument: "long" }), (j) => (j.distresse?.rating && j.intra?.entryZone ? null : "missing verdict/plan"));
await json("/api/desk/KO/challenge", post({ text: "but the valuation is too expensive" }), (j) => (j.answer ? null : "no answer"));
await json("/api/chat", post({ message: "where should we lean?" }), (j) => (j.reply && !/sample/i.test(j.reply) ? null : "no/sample reply"));
for (const w of ["config", "conflicts", "news", "indicators", "commodities", "hazards", "country-threat", "assets", "power-plants", "report", "x-feed", "predictions"]) {
  await json(`/api/whitewatch/${w}`);
}
// members API must refuse without a session
{
  const r = await fetch(BASE + "/api/models/stress", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  const line = `${r.status} unauthenticated POST /api/models/stress (expect 401)`;
  console.log(line);
  if (r.status !== 401) fails.push(line);
}

// ── data freshness ──
console.log("\ndata exports:");
const today = Date.now();
for (const d of readdirSync("public/data")) {
  try {
    const j = JSON.parse(readFileSync(`public/data/${d}/latest.json`, "utf8"));
    const asOf = j.as_of ?? j.generated_at?.slice(0, 10);
    const age = Math.round((today - Date.parse(asOf)) / 86400_000);
    const prov = j.data_provenance ?? (typeof j.provenance === "string" ? j.provenance : j.provenance?.kind) ?? "—";
    const line = `  ${d.padEnd(14)} as_of ${asOf}  (${age}d)  ${prov}`;
    console.log(line);
    if (/synthetic/.test(String(prov))) fails.push(`data ${d} is synthetic`);
    else if (age > 5 && d !== "factor") warns.push(`data ${d} is ${age} days old`);
  } catch (e) {
    fails.push(`data ${d}: unreadable`);
  }
}

console.log(`\n${fails.length ? "FAILURES" : "No failures"} (${fails.length}), warnings (${warns.length})`);
for (const f of fails) console.log("  ✗", f);
for (const w of warns) console.log("  !", w);
process.exit(fails.length ? 1 : 0);
