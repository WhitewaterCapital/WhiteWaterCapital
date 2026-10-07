"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

// Shown when a page throws while rendering. Keeps the site's look and offers
// a retry instead of a blank screen.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6">
      <p className="font-mono text-sm text-accent">{"// Something broke"}</p>
      <h1 className="display mt-3 text-4xl">This page hit an error.</h1>
      <p className="mt-4 text-muted">
        Usually a data source was briefly unreachable. Try again. If it keeps happening, tell
        the team{error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div className="mt-8 flex items-center gap-6 text-xs uppercase tracking-[0.12em]">
        <button
          onClick={() => unstable_retry()}
          className="rounded-full bg-foreground px-5 py-2 text-background hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/" className="text-muted hover:text-foreground">Home →</Link>
      </div>
    </main>
  );
}
