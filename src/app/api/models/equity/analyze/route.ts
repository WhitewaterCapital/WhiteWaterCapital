import { NextResponse } from "next/server";
import { resolveSecurity } from "@/lib/incepta-resolve";

// Resolves a ticker to REAL Incepta output (universe → live engine). The engine
// steps shell out to Python, so this needs the Node runtime and a machine that
// has the engine + its venv (local / self-hosted worker — not Vercel
// serverless). Production will call an engine service instead; same schema, so
// the UI is unchanged.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").trim().toUpperCase();

  const res = await resolveSecurity(ticker);
  if (res.status === "ok") {
    return NextResponse.json({ status: "ok", source: res.source, security: res.security });
  }
  return NextResponse.json(
    { status: res.status, message: res.message },
    { status: res.status === "invalid" ? 400 : 200 },
  );
}
