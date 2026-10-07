import { NextResponse } from "next/server";
import { resolveSecurity } from "@/lib/incepta-resolve";

// Resolves a ticker to real evidence: the published Incepta universe, else the
// live TypeScript engine (SEC + Yahoo) — any listed ticker, on Vercel too.
export const runtime = "nodejs";
export const maxDuration = 60;

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
