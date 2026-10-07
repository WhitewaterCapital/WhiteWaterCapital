import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { MacroModel, MacroReading } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// Macro Tracker — a MacroModel. REAL DATA (replaced the RNG demo 2026-10).
//
// Reads public/data/macro-tracker/latest.json, written by
// `npm run refresh:macro` (scripts/refresh-macro.mts):
//   • per-sector sentiment from the 8 SPDR sector ETFs on real prices —
//     3-month and 1-month return RELATIVE to SPY plus 50/200-day trend
//   • market-level gauge from each sector's ABSOLUTE trend + breadth
//   • regime from SPY's trend, breadth, cyclical-vs-defensive leadership and
//     the 10-year yield's 1-month change
//   • catalysts: the Fed's published FOMC dates + the real earnings calendar
// No export → an honest "not refreshed" reading, never invented numbers.
// ═══════════════════════════════════════════════════════════════════════════

const FILE = path.join(process.cwd(), "public", "data", "macro-tracker", "latest.json");

type MacroExportFile = {
  as_of: string;
  regime: string;
  sentiment: number;
  sectors: { sector: string; sentiment: number; note: string }[];
  catalysts: { date: string; event: string; importance: "high" | "medium" | "low" }[];
  summary: string;
};

export const macroTracker: MacroModel = {
  meta: {
    id: "macro-tracker",
    name: "Macro Tracker",
    kind: "macro",
    status: "live",
    tagline: "Daily cross-sector read on real prices — rotation, breadth, rates and the catalyst calendar.",
    description:
      "Scores each of the 8 SPDR sectors on real price trends relative to the S&P 500, reads market breadth and the 10-year yield, and lists the real catalyst calendar (FOMC decisions and upcoming earnings). Refreshed with `npm run refresh:macro`.",
  },

  async read(dateISO: string): Promise<MacroReading> {
    let data: MacroExportFile | null = null;
    try {
      data = JSON.parse(await fs.readFile(FILE, "utf8")) as MacroExportFile;
    } catch {
      data = null;
    }
    if (!data) {
      return {
        date: dateISO,
        regime: "Not refreshed",
        sentiment: 0,
        sectors: [],
        catalysts: [],
        summary: "The macro tracker hasn't been refreshed yet — run `npm run refresh:macro`. Nothing invented in its place.",
        generatedBy: "Macro Tracker · no data",
      };
    }
    return {
      date: data.as_of,
      regime: data.regime,
      sentiment: data.sentiment,
      sectors: data.sectors.map((s) => ({ sector: s.sector, sentiment: s.sentiment, note: s.note })),
      catalysts: data.catalysts,
      summary: data.summary,
      generatedBy: `Macro Tracker · real prices as of ${data.as_of}`,
    };
  },
};
