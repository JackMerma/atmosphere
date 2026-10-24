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
  /**
   * What the action is called, from the file it was harvested out of.
   * "Standing Jump", "Jogging". The only human-readable handle a harvested
   * pose has, and worth keeping: when a choice looks wrong, this is what says
   * which animation it came out of.
   */
  label: string;
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
 * How far apart two shortlisted poses must be, in degrees, to both be worth
 * showing.
 *
 * An animation samples a continuous motion, so the poses nearest a target are
 * usually consecutive frames of one clip -- measured at 0.40s, 0.48s and 0.56s
 * of the same file. Asking a judge to choose between near-identical pictures
 * wastes the one question we get to ask it.
 */
const DEFAULT_SPREAD = 15;

/**
 * The `count` library poses closest to `target`, nearest first, kept distinct
 * from each other.
 *
 * This is the measured half of the selection. The planner already states the
 * exact direction every segment should point, so narrowing hundreds of poses
 * to a handful costs nothing and asks nobody -- the same reasoning that made
 * attention measured rather than guessed at (see `docs/decisions.md`). Only the
 * final pick among these is worth a question, because that is the part a number
 * gets wrong: two poses a degree apart on paper can read very differently.
 *
 * The nearest pose is always kept. After that a pose has to be `spread` degrees
 * from everything already shortlisted to earn its place, so the judge is given
 * real alternatives rather than one pose photographed several times. If too few
 * qualify, the remaining nearest fill the list rather than returning short.
 */
export function nearestPoses(
  target: PoseSegments,
  library: LibraryPose[],
  count: number,
  spread = DEFAULT_SPREAD
): Match[] {
  const ranked = library
    .map((pose) => ({ pose, distance: segmentDistance(pose.segments, target) }))
    .sort((l, r) => l.distance - r.distance);

  const wanted = Math.max(1, count);
  const chosen: Match[] = [];
  const passed: Match[] = [];

  for (const match of ranked) {
    if (chosen.length >= wanted) break;
    const distinct = chosen.every(
      (taken) => segmentDistance(taken.pose.segments, match.pose.segments) >= spread
    );
    if (distinct) chosen.push(match);
    else passed.push(match);
  }
  // Nothing qualified far enough apart; a short list is worse than a close one.
  for (const match of passed) {
    if (chosen.length >= wanted) break;
    chosen.push(match);
  }
  return chosen.sort((l, r) => l.distance - r.distance);
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

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const back = new THREE.Vector3();
const world = new THREE.Vector3();

/**
 * A library pose expressed in a camera's frame.
 *
 * The library is harvested through `canonicalCamera`, whose basis is the
 * identity, so its vectors are world directions. The planner writes its targets
 * "as seen from the camera" the generation is running with. Comparing the two
 * without this is comparing different coordinate systems that agree only while
 * the user has not orbited -- a bug that would look like a merely bad match.
 */
export function toCameraFrame(segments: PoseSegments, camera: THREE.Camera): PoseSegments {
  camera.updateMatrixWorld(true);
  camera.matrixWorld.extractBasis(right, up, back);

  const out = {} as PoseSegments;
  for (const key of KEYS) {
    const v = segments[key];
    if (!v) continue;
    world.fromArray(v);
    out[key] = [world.dot(right), world.dot(up), world.dot(back)];
  }
  return out;
}

/** Fetched once and kept; the file is static and a generation reads it per beat. */
let pending: Promise<LibraryPose[]> | null = null;

/**
 * The pose vocabulary, or an empty list when none has been harvested.
 *
 * Missing is not an error: the app falls back to the planner authoring poses
 * outright, which is what it did before a library existed.
 */
export function loadLibrary(): Promise<LibraryPose[]> {
  pending ??= fetch("/poseLibrary.json")
    .then((res) => (res.ok ? (res.json() as Promise<LibraryPose[]>) : []))
    .catch(() => []);
  return pending;
}
