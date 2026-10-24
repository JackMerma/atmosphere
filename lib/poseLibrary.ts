import * as THREE from "three";
import type { PoseSegments, Vec3 } from "@/lib/poseRetarget";

/**
 * One pose in the vocabulary the app chooses from.
 *
 * Stored as segment directions, not bone rotations, which is what makes a
 * library worth having at all: segments are rig-independent by construction
 * (see `poseRetarget.ts`), so a pose harvested from one skeleton applies to any
 * humanoid the user uploads. The whole library is numbers -- no meshes, no
 * textures, no animation tracks -- so it costs a JSON file, not a download.
 */
export interface LibraryPose {
  /** Stable identifier, unique across the library. */
  id: string;
  /** Where it came from: the file and clip it was sampled out of. */
  source: string;
  /** Seconds into that clip, which is the only label a harvested pose really has. */
  time: number;
  segments: PoseSegments;
}

/**
 * Every segment a pose can carry. Distances compare only the ones both poses
 * define, so a library entry missing a foot is not punished for it.
 */
const KEYS: (keyof PoseSegments)[] = [
  "across",
  "torso_up",
  "head_up",
  "upper_arm_l",
  "forearm_l",
  "upper_arm_r",
  "forearm_r",
  "thigh_l",
  "shin_l",
  "foot_l",
  "thigh_r",
  "shin_r",
  "foot_r",
];

/**
 * The limbs a pose is usually *about*, weighted above the rest.
 *
 * Averaged flat, a pose matches well by getting the torso and head roughly
 * right while both legs point the wrong way -- and the legs are the whole
 * difference between a walk contact and standing still. Arms and legs carry the
 * action; the spine and head mostly follow.
 */
const WEIGHTS: Partial<Record<keyof PoseSegments, number>> = {
  across: 0.5,
  torso_up: 1,
  head_up: 0.5,
};
const DEFAULT_WEIGHT = 1.5;

const a = new THREE.Vector3();
const b = new THREE.Vector3();

/** Angle between two segment directions, in degrees. */
function angleBetween(x: Vec3, y: Vec3) {
  a.fromArray(x);
  b.fromArray(y);
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return 0;
  return THREE.MathUtils.radToDeg(a.normalize().angleTo(b.normalize()));
}

/**
 * How far apart two poses are, in degrees: the weighted mean angle over every
 * segment both of them define.
 *
 * Mean rather than worst-case, because one segment the harvest got wrong -- a
 * foot on a clip frame where the toe is curled -- should not disqualify an
 * otherwise perfect match.
 */
export function segmentDistance(x: PoseSegments, y: PoseSegments): number {
  let total = 0;
  let weight = 0;
  for (const key of KEYS) {
    const left = x[key];
    const right = y[key];
    if (!left || !right) continue;
    const w = WEIGHTS[key] ?? DEFAULT_WEIGHT;
    total += angleBetween(left, right) * w;
    weight += w;
  }
  return weight === 0 ? Infinity : total / weight;
}

export interface Match {
  pose: LibraryPose;
  /** Weighted mean angle from the target, in degrees. */
  distance: number;
}

/**
 * The `count` library poses closest to `target`, nearest first.
 *
 * This is the measured half of the selection. The planner already states the
 * exact direction every segment should point, so narrowing hundreds of poses
 * to a handful costs nothing and asks nobody -- the same reasoning that made
 * attention measured rather than guessed at (see `docs/decisions.md`). Only the
 * final pick among these is worth a question, because that is the part a number
 * gets wrong: two poses a degree apart on paper can read very differently.
 */
export function nearestPoses(
  target: PoseSegments,
  library: LibraryPose[],
  count: number
): Match[] {
  return library
    .map((pose) => ({ pose, distance: segmentDistance(pose.segments, target) }))
    .sort((l, r) => l.distance - r.distance)
    .slice(0, Math.max(1, count));
}

/**
 * The canonical frame every library pose is stored in.
 *
 * Segments are read "as seen from the camera", so a library needs one fixed
 * camera or its entries mean different things depending on where the user had
 * orbited when each was harvested. An untransformed camera sits at the origin
 * looking down -z, which makes the frame exactly x-right, y-up, z-toward-viewer
 * -- the same axes the segment type documents.
 */
export function canonicalCamera(): THREE.Camera {
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld(true);
  return camera;
}
