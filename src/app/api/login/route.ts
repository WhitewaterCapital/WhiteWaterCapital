import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  isValidPasscode,
  loginConfigured,
  safeNext,
} from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const passcode = String(form.get("passcode") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));

  const token = loginConfigured() && isValidPasscode(passcode) ? await createSessionToken() : null;
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
  return res;
}
