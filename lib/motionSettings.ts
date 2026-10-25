import { DEFAULT_LIMIT_STRENGTH } from "@/lib/jointLimits";

/**
 * What the generation is allowed to spend, and how physical the body is.
 *
 * Kept in its own module because the store holds them and the pipeline reads
 * them: putting them beside either would make the two import each other.
 */
export interface MotionSettings {
  /**
   * How many of the nearest vocabulary poses go into the knockout for each
   * pose of the plan. Measured, free, and drawn from the whole harvested
   * library -- not a limit on how many poses were harvested.
   */
  rankedPoses: number;
  /** How many poses Jev compares in a single question. */
  optionsPerQuery: number;
  /** How many of a round's questions are asked at the same time. */
  batches: number;
  /** How hard the anatomical joint limits bite, 0 (off) to 1 (full). */
  limitStrength: number;
  /**
   * How far a moved joint is felt by the joints above it, 0 (that joint alone)
   * to 1 (the pull reaches all the way into the shoulder and chest). Governs
   * dragging a joint by hand.
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

export const RANKED_RANGE = { min: 4, max: 50, default: 25 };
export const OPTIONS_PER_QUERY_RANGE = { min: 1, max: 4, default: 4 };
export const BATCHES_RANGE = { min: 1, max: 5, default: 5 };
export const LIMIT_RANGE = { min: 0, max: 1, default: DEFAULT_LIMIT_STRENGTH };
export const CHAIN_RANGE = { min: 0, max: 1, default: 0.05 };
export const COLLISION_RANGE = { min: 0, max: 1, default: 1 };

export const DEFAULT_SETTINGS: MotionSettings = {
  rankedPoses: RANKED_RANGE.default,
  optionsPerQuery: OPTIONS_PER_QUERY_RANGE.default,
  batches: BATCHES_RANGE.default,
  limitStrength: LIMIT_RANGE.default,
  chainStrength: CHAIN_RANGE.default,
  collisionStrength: COLLISION_RANGE.default,
};
