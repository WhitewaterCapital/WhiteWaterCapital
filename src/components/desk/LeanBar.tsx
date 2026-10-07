// The lean bar — the desk's signature visual. Centre line = neutral; the bar
// grows right (long) or left (short), its length = conviction. Every model and
// the desk view use it, so the whole read can be scanned at a glance.
export function LeanBar({
  direction,
  conviction,
  size = "md",
}: {
  direction: number; // −1..+1
  conviction: number; // 0..100
  size?: "sm" | "md" | "lg";
}) {
  const side = direction > 0.02 ? "long" : direction < -0.02 ? "short" : "flat";
  const w = side === "flat" ? 0 : Math.max(4, Math.min(50, conviction / 2));
  const h = size === "lg" ? "h-2.5" : size === "sm" ? "h-1" : "h-1.5";
  return (
    <div className={`relative w-full ${h} rounded-full bg-hairline/70`} aria-hidden>
      <div className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/35" />
      {side !== "flat" && (
        <div
          className={`absolute inset-y-0 rounded-full ${side === "long" ? "bg-long" : "bg-short"}`}
          style={side === "long" ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
        />
      )}
    </div>
  );
}

const CALL_TONE: Record<string, string> = {
  Long: "text-long",
  "Lean long": "text-long",
  Neutral: "text-neutral-lean",
  "Lean short": "text-short",
  Short: "text-short",
};
export const callTone = (call: string | null) => (call ? CALL_TONE[call] ?? "text-muted" : "text-muted");
