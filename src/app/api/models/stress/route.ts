import { NextResponse } from "next/server";
import { models } from "@/lib/models/registry";
import type { TradeIdea, Instrument, TradeEvidence } from "@/lib/models/types";
import { resolveSecurity } from "@/lib/incepta-resolve";

// Runs both Stress Test engines on one idea: Distresse (verdict) + Intra (plan).
// It first resolves the ticker to REAL Incepta output (published universe, then
// the live engine where reachable) and attaches that risk/quality/valuation
// read as evidence — the engine is the evidence, Distresse is the judge on top.
// If no real data exists for the name here, Distresse abstains honestly rather
// than scoring nothing.
//
// The engine resolution can shell out to Python, so this needs the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  const instrument = String(body.instrument ?? "long") as Instrument;
  const thesis = String(body.thesis ?? "").trim();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
  }

  // Resolve real evidence for this ticker (universe → live engine).
  let evidence: TradeEvidence | undefined;
  let evidenceNote: string | null = null;
  const res = await resolveSecurity(ticker);
  if (res.status === "ok") {
    const sec = res.security;
    // Insufficient-confidence names carry no usable numbers — don't attach them.
    if (sec.confidence !== "insufficient") {
      evidence = {
        source: `Incepta (${res.source})`,
        confidence: sec.confidence,
        asOf: sec.as_of,
        risk: sec.risk as TradeEvidence["risk"],
        quality: sec.quality as TradeEvidence["quality"],
        valuation: sec.valuation as TradeEvidence["valuation"],
        flags: [
          ...(sec.data_quality.flags ?? []),
          ...(sec.valuation?.flags ?? []),
        ],
      };
    } else {
      evidenceNote = "The engine has data for this name but abstains — insufficient confidence to attach numbers.";
    }
  } else if (res.status !== "invalid") {
    evidenceNote = res.message;
  }

  const idea: TradeIdea = {
    ticker,
    instrument,
    thesis,
    horizon: body.horizon ? String(body.horizon) : undefined,
    sizePct: body.sizePct ? Number(body.sizePct) : undefined,
    evidence,
  };

  const [distresse, intra] = await Promise.all([
    models.distresse.evaluate(idea),
    models.intraExitus.plan(idea),
  ]);

  return NextResponse.json({ idea, distresse, intra, evidence: evidence ?? null, evidenceNote });
}
