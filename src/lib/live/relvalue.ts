import type { Bar } from "./yahoo";

// ---------------------------------------------------------------------------
// Relative value vs the stock's sector ETF — Engle-Granger two-step, the same
// test the Kalman pairs engine uses (kalman-engine/kf/cointegration.py):
//   1. OLS  log P_stock = a + b · log P_sector  over the last year
//   2. ADF(1) on the residual e:  Δe_t = ρ·e_{t−1} + γ·Δe_{t−1} + ε
//      t = ρ̂ / se(ρ̂) vs MacKinnon's 2-variable critical values
//      (1% −3.90, 5% −3.34, 10% −3.04)
// If cointegrated: z = today's residual in standard deviations, half-life from
// an AR(1) on e. Stretched (|z| ≥ 2) → expect convergence. If NOT
// cointegrated, there's no statistical tie to trade — said plainly.
// ---------------------------------------------------------------------------

export type RelValue = {
  etf: string;
  n: number;
  hedge: number;
  adfT: number;
  evidence: "strong" | "moderate" | "none";
  cointegrated: boolean;
  z: number | null;
  halfLife: number | null;
  rel3m: number; // stock 3m return minus sector 3m return
};

export function relativeValue(stock: Bar[], sector: Bar[], etf: string): RelValue | null {
  const sm = new Map(sector.map((b) => [b.date, b.close]));
  const rows = stock.filter((b) => sm.has(b.date)).slice(-252);
  if (rows.length < 120) return null;
  const y = rows.map((b) => Math.log(b.close));
  const x = rows.map((b) => Math.log(sm.get(b.date)!));
  const n = y.length;

  // 1) cointegrating regression
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  const e = y.map((v, i) => v - a - b * x[i]);

  // 2) ADF(1) on residuals (no constant: residuals are mean-zero by construction)
  const de = e.slice(1).map((v, i) => v - e[i]);
  const Y: number[] = [];
  const X1: number[] = [];
  const X2: number[] = [];
  for (let t = 1; t < de.length; t++) {
    Y.push(de[t]);
    X1.push(e[t]); // e_{t-1} relative to de[t] (de[t] = e[t+1]-e[t])
    X2.push(de[t - 1]);
  }
  // OLS with two regressors, no intercept: solve (X'X) β = X'Y
  const s11 = X1.reduce((s, v) => s + v * v, 0);
  const s22 = X2.reduce((s, v) => s + v * v, 0);
  const s12 = X1.reduce((s, v, i) => s + v * X2[i], 0);
  const s1y = X1.reduce((s, v, i) => s + v * Y[i], 0);
  const s2y = X2.reduce((s, v, i) => s + v * Y[i], 0);
  const det = s11 * s22 - s12 * s12;
  if (det <= 0) return null;
  const rho = (s22 * s1y - s12 * s2y) / det;
  const gam = (s11 * s2y - s12 * s1y) / det;
  const resid = Y.map((v, i) => v - rho * X1[i] - gam * X2[i]);
  const sigma2 = resid.reduce((s, v) => s + v * v, 0) / (Y.length - 2);
  const seRho = Math.sqrt((sigma2 * s22) / det);
  const adfT = seRho > 0 ? rho / seRho : 0;

  const evidence: RelValue["evidence"] = adfT < -3.9 ? "strong" : adfT < -3.34 ? "moderate" : "none";
  const cointegrated = evidence !== "none";

  const meanE = e.reduce((s, v) => s + v, 0) / n;
  const sdE = Math.sqrt(e.reduce((s, v) => s + (v - meanE) ** 2, 0) / (n - 1));
  const z = cointegrated && sdE > 0 ? (e[n - 1] - meanE) / sdE : null;
  let halfLife: number | null = null;
  if (cointegrated) {
    let num = 0;
    let den = 0;
    for (let i = 1; i < n; i++) {
      num += (e[i - 1] - meanE) * (e[i] - meanE);
      den += (e[i - 1] - meanE) ** 2;
    }
    const phi = den > 0 ? num / den : 1;
    halfLife = phi > 0 && phi < 1 ? Math.log(2) / -Math.log(phi) : null;
  }
  const r3 = (arr: number[]) => (arr.length > 63 ? Math.exp(arr[arr.length - 1] - arr[arr.length - 64]) - 1 : 0);
  return { etf, n, hedge: b, adfT, evidence, cointegrated, z, halfLife, rel3m: r3(y) - r3(x) };
}
