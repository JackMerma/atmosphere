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
}

export const ITERATIONS_RANGE = { min: 0, max: 50, default: 10 };
export const MOTION_ROUNDS_RANGE = { min: 0, max: 12, default: 4 };
export const CANDIDATES_RANGE = { min: 2, max: 8, default: 4 };
export const STEP_RANGE = { min: 5, max: 60, default: 20 };
export const LIMIT_RANGE = { min: 0, max: 1, default: DEFAULT_LIMIT_STRENGTH };

export const DEFAULT_SETTINGS: MotionSettings = {
  iterations: ITERATIONS_RANGE.default,
  motionRounds: MOTION_ROUNDS_RANGE.default,
  candidates: CANDIDATES_RANGE.default,
  stepDegrees: STEP_RANGE.default,
  limitStrength: LIMIT_RANGE.default,
};
