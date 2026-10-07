import type { Bar } from "./yahoo";
import type { RiskRead } from "@/lib/models/incepta-export";

// ---------------------------------------------------------------------------
// Price/risk features from daily bars — the TypeScript twin of the Python
// engine's features (engine/incepta/features/returns.py), so a live read for
// any ticker means the same thing as the pre-computed universe:
//   mom_12_1      close[t−21]/close[t−252] − 1   (Jegadeesh-Titman, skip month)
//   ret_1m        close[t]/close[t−21] − 1
//   realized_vol  stdev of daily log returns (1y) · √252
//   downside_vol  semi-deviation of daily log returns (1y) · √252
//   ewma_vol      RiskMetrics EWMA (λ = 0.94) · √252
//   max_dd_1y     worst peak-to-trough over 1y (negative)
//   high_52w_ratio close / 1y max close
//   beta_mkt      cov(r, r_SPY)/var(r_SPY) over 1y; idio_vol = residual stdev · √252
//   spread_bps    Corwin-Schultz high-low spread estimate, 21-day mean
// ---------------------------------------------------------------------------

const Y = 252;

function logRets(bars: Bar[]): { date: string; r: number }[] {
  const out: { date: string; r: number }[] = [];
  for (let i = 1; i < bars.length; i++) out.push({ date: bars[i].date, r: Math.log(bars[i].close / bars[i - 1].close) });
  return out;
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const sd = (x: number[]) => {
  const m = mean(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
};

function corwinSchultz(bars: Bar[]): number | null {
  const k = 3 - 2 * Math.SQRT2;
  const s: number[] = [];
  for (let i = Math.max(1, bars.length - 22); i < bars.length; i++) {
    const a = bars[i - 1];
    const b = bars[i];
    if (!(a.low > 0 && b.low > 0)) continue;
    const beta = Math.log(a.high / a.low) ** 2 + Math.log(b.high / b.low) ** 2;
    const gamma = Math.log(Math.max(a.high, b.high) / Math.min(a.low, b.low)) ** 2;
    const alpha = (Math.sqrt(2 * beta) - Math.sqrt(beta)) / k - Math.sqrt(gamma / k);
    const sp = (2 * (Math.exp(alpha) - 1)) / (1 + Math.exp(alpha));
    s.push(Math.max(0, sp));
  }
  return s.length ? mean(s) * 1e4 : null;
}

export function riskFeatures(bars: Bar[], spyBars: Bar[] | null): RiskRead | null {
  if (bars.length < 30) return null;
  const c = bars.map((b) => b.close);
  const n = c.length;
  const last = c[n - 1];
  const rets = logRets(bars);
  const yr = rets.slice(-Y).map((x) => x.r);

  const mom = n > Y ? c[n - 1 - 21] / c[n - 1 - Y] - 1 : null;
  const ret1m = n > 21 ? last / c[n - 1 - 21] - 1 : null;
  const rv = yr.length > 20 ? sd(yr) * Math.sqrt(Y) : null;
  const dv = yr.length > 20 ? Math.sqrt(mean(yr.map((r) => Math.min(r, 0) ** 2))) * Math.sqrt(Y) : null;

  let ew: number | null = null;
  if (rets.length > 60) {
    let v = sd(rets.slice(0, 60).map((x) => x.r)) ** 2;
    for (const { r } of rets.slice(60)) v = 0.94 * v + 0.06 * r * r;
    ew = Math.sqrt(v * Y);
  }

  const win = c.slice(-Y);
  let peak = -Infinity;
  let dd = 0;
  for (const x of win) {
    peak = Math.max(peak, x);
    dd = Math.min(dd, x / peak - 1);
  }

  let beta: number | null = null;
  let idio: number | null = null;
  if (spyBars && spyBars.length > 60) {
    const spy = new Map(logRets(spyBars).map((x) => [x.date, x.r]));
    const pairs = rets.slice(-Y).filter((x) => spy.has(x.date)).map((x) => [x.r, spy.get(x.date)!] as const);
    if (pairs.length > 60) {
      const xs = pairs.map((p) => p[1]);
      const ys = pairs.map((p) => p[0]);
      const mx = mean(xs);
      const my = mean(ys);
      const cov = pairs.reduce((a, [y, x]) => a + (x - mx) * (y - my), 0) / (pairs.length - 1);
      const varx = xs.reduce((a, x) => a + (x - mx) ** 2, 0) / (pairs.length - 1);
      beta = varx > 0 ? cov / varx : null;
      if (beta != null) {
        const alpha = my - beta * mx;
        idio = sd(pairs.map(([y, x]) => y - alpha - beta! * x)) * Math.sqrt(Y);
      }
    }
  }

  return {
    last_close: bars[n - 1].rawClose,
    n_bars: n,
    mom_12_1: mom,
    ret_1m: ret1m,
    realized_vol: rv,
    downside_vol: dv,
    ewma_vol: ew,
    max_dd_1y: win.length > 20 ? dd : null,
    high_52w_ratio: win.length > 20 ? last / Math.max(...win) : null,
    spread_bps: corwinSchultz(bars),
    beta_mkt: beta,
    beta_smb: null,
    beta_hml: null,
    beta_mom: null,
    factor_r2: null,
    idio_vol: idio,
    n_factor_obs: null,
  };
}
