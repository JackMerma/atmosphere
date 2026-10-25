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
 * They were searched by a tuning loop once; that loop is gone and they are now
 * simply what playback uses. Kept because playback genuinely needs them: the
 * drag between joints and the floor contact are what stop a walk reading as a
 * signpost swinging round.
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
