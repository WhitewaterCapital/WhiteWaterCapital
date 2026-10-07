import Link from "next/link";
import { loginConfigured, safeNext } from "@/lib/auth";

export const metadata = { title: "Members sign in", robots: { index: false } };

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next, error } = await searchParams;
  const configured = loginConfigured();

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-sm flex-col justify-center px-5">
      <Link href="/" className="text-sm font-semibold uppercase tracking-[0.18em]">
        Whitewater
      </Link>
      <h1 className="display mt-8 text-3xl">Members sign in</h1>
      <p className="mt-2 text-sm text-muted">Enter the club passcode to reach the Desk.</p>

      {configured ? (
        <form action="/api/login" method="post" className="mt-6 space-y-3">
          <input type="hidden" name="next" value={safeNext(next)} />
          <input
            type="password"
            name="passcode"
            placeholder="Passcode"
            autoComplete="current-password"
            autoFocus
            className="w-full border border-hairline bg-transparent px-3 py-2.5 text-sm outline-none focus:border-foreground/40"
          />
          {error ? <p className="text-sm text-rose-500">Wrong passcode. Try again.</p> : null}
          <button className="w-full bg-foreground px-3 py-2.5 text-sm font-medium text-background hover:opacity-90">
            Enter
          </button>
        </form>
      ) : (
        <p className="mt-6 border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Members sign-in isn&apos;t configured yet. An admin needs to set <code>MEMBER_PASSCODE</code>{" "}
          in the hosting settings.
        </p>
      )}

      <Link href="/" className="mt-8 text-xs uppercase tracking-[0.12em] text-muted hover:text-foreground">
        ← Back to site
      </Link>
    </main>
  );
}
