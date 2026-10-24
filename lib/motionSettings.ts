import { DEFAULT_LIMIT_STRENGTH } from "@/lib/jointLimits";

/**
 * Limits on how hard the app works at a pose, shared by the Motion panel and
 * every refinement.
 *
 * Kept in its own module because the store holds them and the refinement reads
 * them: putting them beside either would make the two import each other.
 */
export interface MotionSettings {
  /** Refinement rounds per judged pose. */
  iterations: number;
  /**
   * Rounds spent tuning how the finished poses are PLAYED, judged as whole
   * motion rather than pose by pose. 0 plays them exactly as authored, which
   * is how to see what this is worth.
   */
  motionRounds: number;
  /** Candidate poses tried (and ranked together) each round. */
  candidates: number;
  /** Largest rotation, in degrees, a random nudge may apply to a limb. */
  stepDegrees: number;
  /** How hard the anatomical joint limits bite, 0 (off) to 1 (full). */
  limitStrength: number;
  /**
   * How far a moved joint is felt by the joints above it, 0 (that joint alone)
   * to 1 (the pull reaches all the way into the shoulder and chest). Governs
   * dragging a joint by hand; the generation pipeline does not move joints this
   * way, so it has no effect on a generated pose.
   */
  chainStrength: number;
  /**
   * How much of a detected overlap between two body parts is corrected, 0
   * (limbs pass through each other freely) to 1 (fully rigid). Separate from
   * the joint-limit dial: a body can bend past a normal range and still not
   * pass through itself, or the reverse.
   */
  collisionStrength: number;
}

export const ITERATIONS_RANGE = { min: 0, max: 50, default: 10 };
export const MOTION_ROUNDS_RANGE = { min: 0, max: 12, default: 4 };
export const CANDIDATES_RANGE = { min: 2, max: 8, default: 4 };
export const STEP_RANGE = { min: 5, max: 60, default: 20 };
export const LIMIT_RANGE = { min: 0, max: 1, default: DEFAULT_LIMIT_STRENGTH };
export const CHAIN_RANGE = { min: 0, max: 1, default: 1 };
export const COLLISION_RANGE = { min: 0, max: 1, default: 1 };

export const DEFAULT_SETTINGS: MotionSettings = {
  iterations: ITERATIONS_RANGE.default,
  motionRounds: MOTION_ROUNDS_RANGE.default,
  candidates: CANDIDATES_RANGE.default,
  stepDegrees: STEP_RANGE.default,
  limitStrength: LIMIT_RANGE.default,
  chainStrength: CHAIN_RANGE.default,
  collisionStrength: COLLISION_RANGE.default,
};
