import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { PROTECTED_PATHS } from "@/lib/modules";

// Guard the members-only sections. The public site ("/", /invest, /about,
// /privacy, ...) stays open. Members API routes answer 401 instead of
// redirecting. Every protected response is also marked noindex.
const PROTECTED = PROTECTED_PATHS;
const PROTECTED_API = ["/api/models", "/api/chat", "/api/search", "/api/desk"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const isApi = PROTECTED_API.some(under);
  if (!isApi && !PROTECTED.some(under)) return NextResponse.next();

  if (await verifySessionToken(req.cookies.get(AUTH_COOKIE)?.value)) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  if (isApi) return NextResponse.json({ error: "Members only" }, { status: 401 });

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sentiment/:path*",
    "/stress-test/:path*",
    "/nova/:path*",
    "/war-map/:path*",
    "/intra-exitus/:path*",
    "/weekly/:path*",
    "/kalman/:path*",
    "/earnings/:path*",
    "/smart-money/:path*",
    "/trade-ideas/:path*",
    "/performance/:path*",
    "/watchlist/:path*",
    "/journal/:path*",
    "/glossary/:path*",
    "/how-it-works/:path*",
    "/models/:path*",
    "/members/:path*",
    "/proposals/:path*",
    "/api/models/:path*",
    "/api/chat/:path*",
    "/api/search/:path*",
    "/api/desk/:path*",
    "/book/:path*",
    "/t/:path*",
  ],
};
