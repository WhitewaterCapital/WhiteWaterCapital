import "server-only";
import { cookies } from "next/headers";
import { AUTH_COOKIE, readSessionToken } from "./auth";

// The signed-in member (name from the session cookie), or null.
export async function getCurrentMember(): Promise<{ name: string } | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(AUTH_COOKIE)?.value);
}
