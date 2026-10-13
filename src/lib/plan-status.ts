// Where the LIVE price sits relative to an entry/exit plan — one helper so
// every page says the same thing. A plan anchored to yesterday's close is
// only "actionable" if today's price is actually in the entry zone.
export type PlanStatus = {
  state: "in-zone" | "wait" | "better" | "invalidated" | "target-hit" | "none";
  label: string; // short pill text
  detail: string; // one sentence
  actionable: boolean;
};

const m = (x: number) => (x >= 100 ? x.toFixed(2) : x >= 10 ? x.toFixed(2) : x.toFixed(3));

export function planStatus(
  bias: "long" | "short" | "none",
  entryZone: [number, number] | null,
  stop: number | null,
  targets: number[],
  price: number | null,
): PlanStatus {
  if (bias === "none" || !entryZone || stop == null || price == null) {
    return { state: "none", label: "No setup", detail: "No trade plan right now.", actionable: false };
  }
  const [lo, hi] = entryZone;
  const t1 = targets[0];
  if (bias === "long") {
    if (price <= stop) return { state: "invalidated", label: "Invalidated", detail: `At $${m(price)} it's through the $${m(stop)} stop — the setup is void.`, actionable: false };
    if (t1 != null && price >= t1) return { state: "target-hit", label: "Ran to target", detail: `Already at the $${m(t1)} target — missed; don't chase.`, actionable: false };
    if (price > hi) {
      const pull = price / hi - 1;
      return { state: "wait", label: `Wait · ${(pull * 100).toFixed(1)}% above`, detail: `At $${m(price)}, ${(pull * 100).toFixed(1)}% above the zone — set a limit at $${m(lo)}–$${m(hi)} and wait for the pullback.`, actionable: false };
    }
    if (price < lo) return { state: "better", label: "Below zone", detail: `At $${m(price)}, under the zone but above the stop — a better-than-planned entry if it holds.`, actionable: true };
    return { state: "in-zone", label: "In the zone", detail: `At $${m(price)}, inside the $${m(lo)}–$${m(hi)} entry zone — actionable now.`, actionable: true };
  }
  // short
  if (price >= stop) return { state: "invalidated", label: "Invalidated", detail: `At $${m(price)} it's through the $${m(stop)} stop — the setup is void.`, actionable: false };
  if (t1 != null && price <= t1) return { state: "target-hit", label: "Ran to target", detail: `Already at the $${m(t1)} target — missed; don't chase.`, actionable: false };
  if (price < lo) {
    const pop = 1 - price / lo;
    return { state: "wait", label: `Wait · ${(pop * 100).toFixed(1)}% below`, detail: `At $${m(price)}, ${(pop * 100).toFixed(1)}% below the zone — set a limit to sell short at $${m(lo)}–$${m(hi)} and wait for the bounce.`, actionable: false };
  }
  if (price > hi) return { state: "better", label: "Above zone", detail: `At $${m(price)}, above the zone but below the stop — a better-than-planned short entry if it holds.`, actionable: true };
  return { state: "in-zone", label: "In the zone", detail: `At $${m(price)}, inside the $${m(lo)}–$${m(hi)} entry zone — actionable now.`, actionable: true };
}

// Expected R of a swing WITHIN its time stop (mirror of the Python engine's
// barrier.expectancy_horizon): simulate n arithmetic Brownian paths for
// `horizon` bars; outcome = +R at the target, −1 at the stop, else the final
// move / risk at the time stop. Seeded → deterministic.
export function expectancyHorizon(a: number, b: number, drift: number, vol: number, horizon: number, n = 4000): number | null {
  if (!(a > 0 && b > 0 && vol > 0 && horizon >= 1) || !Number.isFinite(drift)) return null;
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const R = a / b;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let x = 0;
    let out: number | null = null;
    for (let t = 0; t < horizon; t++) {
      x += drift + vol * gauss();
      if (x >= a) { out = R; break; }
      if (x <= -b) { out = -1; break; }
    }
    sum += out ?? x / b;
  }
  return sum / n;
}
