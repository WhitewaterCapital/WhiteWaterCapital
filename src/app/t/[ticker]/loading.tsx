// While the models run (≈2–4 s on a cold ticker): a calm skeleton of the page
// and a line saying what's happening.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-20 sm:px-6" aria-busy="true">
      <p className="eyebrow">Running the desk</p>
      <p className="serif mt-2 text-3xl text-muted">Reading filings, prices, analysts and insiders…</p>
      <div className="skeleton mt-8 h-20 w-full rounded-xl" />
      <div className="mt-6 grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
      <div className="skeleton mt-10 h-56 w-full rounded-3xl" />
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
