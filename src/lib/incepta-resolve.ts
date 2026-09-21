import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getEquityExport, findSecurity } from "@/lib/incepta";
import type { SecurityAnalysis } from "@/lib/models/incepta-export";

// ---------------------------------------------------------------------------
// Resolve a single security to REAL Incepta output, shared by the equity
// analyze route and the stress route.
//
//   1) published universe (instant, no engine run)
//   2) fast engine export (name already in the engine's store)
//   3) live ingest (SEC + prices) then export
//
// Steps 2–3 shell out to the Python engine, so they only work where the engine
// + its venv live (local / a self-hosted worker) — NOT on Vercel serverless.
// There, resolution stops at step 1 and non-universe names return null, which
// callers must surface honestly ("not covered here") rather than fabricate.
// ---------------------------------------------------------------------------

const run = promisify(execFile);

const ENGINE_DIR = process.env.INCEPTA_ENGINE_DIR || path.join(process.cwd(), "engine");
const PYTHON = process.env.INCEPTA_PYTHON || "python3";

// Only real tickers — also prevents any argument/shell mischief.
export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function usable(s: SecurityAnalysis | null): boolean {
  return Boolean(s && (s.data_quality.has_prices || s.data_quality.has_fundamentals));
}

async function engineExport(ticker: string): Promise<SecurityAnalysis | null> {
  const out = path.join(os.tmpdir(), `incepta_${ticker}_${Date.now()}.json`);
  try {
    await run(PYTHON, ["-m", "incepta.cli", "export", ticker, "--out", out], {
      cwd: ENGINE_DIR,
      timeout: 90_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    const raw = await fs.readFile(out, "utf8");
    const data = JSON.parse(raw);
    return data.securities?.[0] ?? null;
  } catch {
    return null;
  } finally {
    fs.unlink(out).catch(() => {});
  }
}

async function engineIngest(ticker: string): Promise<boolean> {
  try {
    await run(PYTHON, ["-m", "incepta.cli", "ingest", ticker], {
      cwd: ENGINE_DIR,
      timeout: 110_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return true;
  } catch {
    return false;
  }
}

export type Resolution =
  | { status: "ok"; source: "universe" | "engine"; security: SecurityAnalysis }
  | { status: "invalid" | "unavailable"; message: string };

// Universe-only lookup (never shells out). Safe on Vercel. Used to attach
// evidence without paying the engine cost.
export async function resolveFromUniverse(ticker: string): Promise<SecurityAnalysis | null> {
  const t = ticker.trim().toUpperCase();
  const published = await getEquityExport();
  if (!published) return null;
  return findSecurity(published, t) ?? null;
}

// Full resolution: universe, then the live engine where available.
export async function resolveSecurity(ticker: string): Promise<Resolution> {
  const t = ticker.trim().toUpperCase();
  if (!TICKER_RE.test(t)) {
    return { status: "invalid", message: "Enter a valid ticker (letters/numbers)." };
  }

  const fromUniverse = await resolveFromUniverse(t);
  if (fromUniverse) return { status: "ok", source: "universe", security: fromUniverse };

  let sec = await engineExport(t);
  if (!usable(sec)) {
    const ok = await engineIngest(t);
    if (!ok) {
      return {
        status: "unavailable",
        message: `Couldn't run the engine for ${t}. It may be an unknown ticker (no SEC CIK) or the engine isn't reachable here.`,
      };
    }
    sec = await engineExport(t);
  }
  if (!usable(sec)) {
    return {
      status: "unavailable",
      message: `No usable data for ${t} — the engine abstains rather than show made-up numbers.`,
    };
  }
  return { status: "ok", source: "engine", security: sec! };
}
