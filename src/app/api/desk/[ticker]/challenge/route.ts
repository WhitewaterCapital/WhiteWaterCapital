import { NextResponse } from "next/server";
import { runDesk } from "@/lib/live/desk";
import { challenge } from "@/lib/live/challenge";

// "Push back": a member's counter-point → fact check, fresh research and a
// re-run of the desk call as if they're right. Free rules engine by default.
export async function POST(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, 400);
  if (text.length < 3) return NextResponse.json({ error: "Say a bit more about what you're seeing." }, { status: 400 });
  const desk = await runDesk(decodeURIComponent(ticker));
  if (!desk) return NextResponse.json({ error: `Couldn't find ${ticker}.` }, { status: 404 });
  return NextResponse.json(await challenge(desk, text));
}
