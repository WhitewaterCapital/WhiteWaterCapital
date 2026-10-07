import { newsFor, type NewsItem } from "@/lib/live/news";

// News in two columns — the company itself, and the world around it
// (its industry + the macro tape). Streams in after the verdict.
const ago = (iso: string | null) => {
  if (!iso) return "";
  const h = (Date.now() - Date.parse(iso)) / 3600_000;
  return h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};
const DOT = { positive: "bg-long", negative: "bg-short", neutral: "bg-hairline" } as const;

function Item({ n }: { n: NewsItem }) {
  return (
    <li className="group py-3">
      <a href={n.url} target="_blank" rel="noopener noreferrer" className="flex gap-3">
        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[n.tone]}`} title={`${n.tone} tone`} />
        <span>
          <span className="text-sm leading-snug text-foreground/90 group-hover:underline">{n.title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {n.source}
            {n.publishedAt ? ` · ${ago(n.publishedAt)}` : ""}
            {n.ring !== "direct" ? ` · ${n.ring}` : ""}
          </span>
        </span>
      </a>
    </li>
  );
}

export async function News({ ticker, name, industry }: { ticker: string; name: string; industry: string | null }) {
  const news = await newsFor(ticker, name, industry);
  const around = [...news.industry.slice(0, 8), ...news.macro.slice(0, 6)];
  const tally = (xs: NewsItem[]) => {
    const p = xs.filter((x) => x.tone === "positive").length;
    const n = xs.filter((x) => x.tone === "negative").length;
    return `${xs.length} stories · ${p} positive · ${n} negative`;
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-[var(--shadow)] sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="serif text-2xl">About {ticker}</h2>
          <span className="text-xs text-muted">{tally(news.direct)}</span>
        </div>
        {news.direct.length ? (
          <ul className="mt-2 divide-y divide-hairline">
            {news.direct.slice(0, 14).map((n) => (
              <Item key={n.url} n={n} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No recent coverage found for {ticker}.</p>
        )}
      </section>
      <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-[var(--shadow)] sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="serif text-2xl">Around it</h2>
          <span className="text-xs text-muted">{industry ?? "industry"} · macro</span>
        </div>
        {around.length ? (
          <ul className="mt-2 divide-y divide-hairline">
            {around.map((n) => (
              <Item key={n.url} n={n} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No related coverage right now.</p>
        )}
      </section>
    </div>
  );
}

export function NewsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-hairline bg-surface p-6">
          <div className="skeleton h-6 w-40 rounded" />
          {[0, 1, 2, 3, 4].map((j) => (
            <div key={j} className="mt-5 space-y-2">
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
