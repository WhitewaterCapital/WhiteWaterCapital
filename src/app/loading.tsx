// Shown while a server-rendered page loads (e.g. the first IBKR statement
// pull or an engine read). A quiet pulse in the site's style, not a blank page.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-3 w-24 animate-pulse bg-hairline" />
      <div className="mt-4 h-10 w-2/3 animate-pulse bg-hairline" />
      <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse bg-paper" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse bg-paper" />
    </div>
  );
}
