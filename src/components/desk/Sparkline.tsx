// A quiet one-year price line with an area wash; colour follows the year's
// direction. Pure SVG, server-rendered.
export function Sparkline({ points, height = 64 }: { points: { date: string; close: number }[]; height?: number }) {
  if (points.length < 2) return null;
  const W = 600;
  const H = height;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const vals = points.map((p) => p.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const y = (v: number) => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? "var(--long)" : "var(--short)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="One-year price">
      <defs>
        <linearGradient id="spark-wash" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#spark-wash)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
