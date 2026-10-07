import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/live/yahoo";

// Search-bar autocomplete: ticker or company name → listed equities/ETFs.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 60) ?? "";
  return NextResponse.json({ results: await searchSymbols(q) });
}
