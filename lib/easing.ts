/** How a segment of an animation accelerates: the "speed" dimension Gemini directs. */
export type Ease = "linear" | "in" | "out" | "inOut" | "overshoot";

export const EASES: Ease[] = ["linear", "in", "out", "inOut", "overshoot"];

/**
 * Maps linear progress 0..1 to eased progress. `overshoot` passes 1 and settles
 * back (an impact that springs), so callers must allow progress outside 0..1.
 */
export function ease(kind: Ease | undefined, t: number) {
  const u = Math.min(1, Math.max(0, t));
  switch (kind) {
    case "linear":
      return u;
    case "in":
      return u * u * u;
    case "out":
      return 1 - Math.pow(1 - u, 3);
    case "overshoot": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    case "inOut":
    default:
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }
}
