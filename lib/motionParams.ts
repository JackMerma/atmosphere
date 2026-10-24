/**
 * The dials that decide how an authored set of poses reads as motion.
 *
 * The poses say where the body goes; these say how it gets there -- how far it
 * commits to each pose, how much the limbs trail, how hard the floor pushes
 * back, where the arms sit in the cycle, and how the time between poses is
 * spent. Every one of them was a hardcoded constant nobody had tuned, and they
 * are exactly the axes a walk was weak on: arms that barely swing, a bob of
 * unknown strength, a drag picked by eye.
 *
 * They are global to an animation rather than per keyframe on purpose: a judge
 * can be shown a whole motion and asked to pick between a handful of these,
 * where per-keyframe dials would be too many to search and would let a cycle
 * drift out of symmetry.
 */
export interface MotionParams {
  /** How far each pose commits, as a multiple of its distance from rest. */
  amplitude: number;
  /** Amplitude on the arm chain alone, multiplying `amplitude`. */
  armAmplitude: number;
  /** Seconds each joint reads the timeline behind the one above it. */
  lag: number;
  /** How much of the floor contact is applied: 1 stands the figure on it, 0 floats. */
  bob: number;
  /** Where the arms sit in the cycle, as a fraction of it, +/- half a cycle. */
  armPhase: number;
  /** Power on the eased progress: <1 arrives early and waits, >1 holds then goes. */
  spacing: number;
}

/** What the pipeline produced before any of this was adjustable. */
export const DEFAULT_MOTION: MotionParams = {
  amplitude: 1,
  armAmplitude: 1,
  lag: 0.03,
  bob: 1,
  armPhase: 0,
  spacing: 1,
};

interface Axis {
  key: keyof MotionParams;
  min: number;
  max: number;
  /** Steps tried away from wherever the axis currently sits. */
  steps: number[];
}

/**
 * The dials, with the range each is allowed and the moves worth trying.
 *
 * The ranges are what a body can still look like: amplitude under 0.5 is a
 * figure barely moving, over 1.8 is a cartoon, and `settlePose` would clamp it
 * back anyway. Steps are coarse because a judge cannot see a 5% change.
 */
const AXES: Axis[] = [
  { key: "amplitude", min: 0.5, max: 1.8, steps: [-0.25, 0.25] },
  { key: "armAmplitude", min: 0.5, max: 2.5, steps: [-0.4, 0.4, 0.8] },
  { key: "lag", min: 0, max: 0.1, steps: [-0.025, 0.025, 0.05] },
  { key: "bob", min: 0, max: 1.4, steps: [-0.35, 0.35] },
  { key: "armPhase", min: -0.5, max: 0.5, steps: [-0.25, 0.25, 0.5] },
  { key: "spacing", min: 0.5, max: 1.8, steps: [-0.3, 0.3] },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** `params` with one dial moved, clamped to what that dial allows. */
export function nudge(params: MotionParams, key: keyof MotionParams, by: number): MotionParams {
  const axis = AXES.find((a) => a.key === key);
  if (!axis) return params;
  return { ...params, [key]: clamp(params[key] + by, axis.min, axis.max) };
}

/**
 * The pool of single-dial moves to try, shuffled.
 *
 * One dial at a time, because a judge comparing two whole motions can tell
 * which is better but not why: moving two dials at once and being told the
 * result is worse says nothing about either. The pool is shuffled so an early
 * round is not always the same dial, and drains as it is used, so the search
 * covers every dial before repeating any.
 */
export function motionMoves(): { key: keyof MotionParams; by: number }[] {
  const moves = AXES.flatMap((axis) => axis.steps.map((by) => ({ key: axis.key, by })));
  for (let i = moves.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return moves;
}

/** Every dial jittered at once, for when the single-dial moves are spent. */
export function jitter(params: MotionParams, scale: number): MotionParams {
  let out = params;
  for (const axis of AXES) {
    const span = (axis.max - axis.min) * 0.25 * scale;
    out = nudge(out, axis.key, (Math.random() * 2 - 1) * span);
  }
  return out;
}

/** A one-line summary of how a set of dials differs from the default, for logs. */
export function describeMotion(params: MotionParams) {
  return AXES.map((axis) => `${axis.key} ${params[axis.key].toFixed(2)}`).join(", ");
}

/** Internals reached by the numeric checks; not part of the module's own surface. */
export const __testing = { AXES };
