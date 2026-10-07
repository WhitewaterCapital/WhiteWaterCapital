// ---------------------------------------------------------------------------
// Shared-passcode gate for the members area (interim, until per-member
// Supabase logins land — see docs/cloud-tasks/01-member-auth.md).
//
// Hardened so it's safe to run in production meanwhile:
//   • the session cookie is HMAC-signed with an expiry, so it can't be forged
//     by setting a cookie by hand (it used to be the literal string "ok")
//   • in production there is NO default passcode: if MEMBER_PASSCODE isn't set,
//     login is disabled rather than open to anyone who guesses "letmein"
//   • changing MEMBER_PASSCODE (or AUTH_SECRET) logs everyone out
// Uses Web Crypto so the same code runs in the proxy and in route handlers.
// ---------------------------------------------------------------------------

export const AUTH_COOKIE = "hf_member";
export const SESSION_DAYS = 30;

const DEV_PASSCODE = "letmein";

// The shared passcode, or null when login is disabled (prod with none set).
export function memberPasscode(): string | null {
  const set = process.env.MEMBER_PASSCODE?.trim();
  if (set) return set;
  return process.env.NODE_ENV === "production" ? null : DEV_PASSCODE;
}

export function loginConfigured(): boolean {
  return memberPasscode() !== null;
}

export function isValidPasscode(input: string): boolean {
  const expected = memberPasscode();
  if (!expected) return false;
  const a = new TextEncoder().encode(input.trim());
  const b = new TextEncoder().encode(expected);
  // Constant-time compare (length leak only).
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function secret(): string | null {
  const s = process.env.AUTH_SECRET?.trim() || memberPasscode();
  return s ? `whitewater-session:${s}` : null;
}

async function hmac(message: string): Promise<string | null> {
  const s = secret();
  if (!s) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(s),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Display name carried in the session (who proposed / voted / wrote it).
// Interim identity until per-member logins land: honest attribution among a
// small trusted group, not proof of identity.
export function cleanMemberName(raw: string): string | null {
  const n = raw.normalize("NFKC").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= 40 ? n : null;
}

const b64u = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

// Cookie value: "v2.<expiresAtMs>.<base64url name>.<hex hmac>" — the HMAC
// covers the expiry AND the name, so neither can be edited.
export async function createSessionToken(name: string): Promise<string | null> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const n = b64u(name);
  const sig = await hmac(`v2.${exp}.${n}`);
  return sig ? `v2.${exp}.${n}.${sig}` : null;
}

export async function readSessionToken(token: string | undefined): Promise<{ name: string } | null> {
  if (!token) return null;
  const [v, expStr, n, sig] = token.split(".");
  if (v !== "v2" || !expStr || !n || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmac(`v2.${expStr}.${n}`);
  if (!expected || expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return { name: unb64u(n) };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return (await readSessionToken(token)) !== null;
}

// Only same-site paths are allowed as a post-login destination (no open redirect).
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/dashboard";
  }
  return next;
}
