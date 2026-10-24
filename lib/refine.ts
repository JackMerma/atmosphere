import * as THREE from "three";
import { applyWorldRotation } from "@/lib/boneMath";
import { mapHumanoid } from "@/lib/humanoidRig";
import { DEFAULT_LIMIT_STRENGTH } from "@/lib/jointLimits";
import { bonesOf, resetToRest, restorePose, snapshotPose, type PoseQuats } from "@/lib/pose";
import {
  applySegmentsToRig,
  measureSegments,
  type PoseSegments,
  type Vec3,
} from "@/lib/poseRetarget";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

/** A pose scoring at least this is considered matched; refinement stops there. */
export const MATCH_THRESHOLD = 0.7;
const MIN_STEP_DEGREES = 3;

/** Tunable from the Motion section; shared by pose refinement everywhere. */
export interface MotionSettings {
  /** Refinement rounds per judged pose. */
  iterations: number;
  /** Candidate poses tried (and judged in parallel) each round. */
  candidates: number;
  /** Largest rotation, in degrees, a random nudge may apply to a limb. */
  stepDegrees: number;
  /** How hard the anatomical joint limits bite, 0 (off) to 1 (full). */
  limitStrength: number;
}

export const ITERATIONS_RANGE = { min: 0, max: 50, default: 10 };
export const CANDIDATES_RANGE = { min: 2, max: 8, default: 4 };
export const STEP_RANGE = { min: 5, max: 60, default: 20 };
export const LIMIT_RANGE = { min: 0, max: 1, default: DEFAULT_LIMIT_STRENGTH };
export const DEFAULT_SETTINGS: MotionSettings = {
  iterations: ITERATIONS_RANGE.default,
  candidates: CANDIDATES_RANGE.default,
  stepDegrees: STEP_RANGE.default,
  limitStrength: LIMIT_RANGE.default,
};

/** What Jev compares the figure to: a written pose or a photo (as a data URL). */
export interface Target {
  text?: string;
  reference?: string;
}

export interface RefineProgress {
  round: number;
  rounds: number;
  /** 1 when this round replaced the pose, 0 when it kept the one it had. */
  match: number;
}

/**
 * Angles the figure is shown from, as a yaw around the model in degrees.
 * Front-on alone hides the front-to-back axis, which is exactly the one a walk,
 * a reach or a kick lives on; the three-quarter view shows both.
 */
const VIEWS = [0, 55];

async function rank(candidates: string[][], target: Target): Promise<number> {
  const res = await fetch("/api/motion/rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, text: target.text, reference: target.reference }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Jev could not compare the poses.");
  return data.best as number;
}

async function score(image: string, target: Target): Promise<number> {
  const res = await fetch("/api/motion/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, text: target.text, reference: target.reference }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Jev could not judge the pose.");
  return data.match as number;
}

/**
 * Limbs as whole chains, so a candidate moves a believable unit of the body
 * rather than one bone in isolation.
 */
const CHAINS: (keyof PoseSegments)[][] = [
  ["upper_arm_l", "forearm_l"],
  ["upper_arm_r", "forearm_r"],
  ["thigh_l", "shin_l", "foot_l"],
  ["thigh_r", "shin_r", "foot_r"],
  ["head_up"],
  ["torso_up"],
];

const mapChain = (
  segments: PoseSegments,
  chain: (keyof PoseSegments)[],
  f: (v: Vec3) => Vec3
): PoseSegments => {
  const next = { ...segments };
  for (const key of chain) {
    const v = segments[key] as Vec3 | undefined;
    if (v) (next[key] as Vec3) = f(v);
  }
  return next;
};

/**
 * Structured edits worth trying, in place of blind noise.
 *
 * Pose estimation from a photo gets left/right and up/down nearly right and
 * depth badly wrong: a limb pointing at the camera looks the same as one
 * pointing away. These moves search exactly that ambiguity — mirroring or
 * leaning a whole limb chain through the screen plane, and turning the body to
 * face the other way — so one accepted candidate fixes a visible error instead
 * of shaving a degree off a joint.
 */
function structuredCandidates(): ((segments: PoseSegments) => PoseSegments)[] {
  const moves: ((segments: PoseSegments) => PoseSegments)[] = [];
  for (const chain of CHAINS) {
    // Mirror the chain's depth: the classic front/back confusion.
    moves.push((s) => mapChain(s, chain, ([x, y, z]) => [x, y, -z]));
    // Lean the chain toward, then away from, the viewer.
    for (const push of [0.6, -0.6]) {
      moves.push((s) => mapChain(s, chain, ([x, y, z]) => [x, y, z + push]));
    }
  }
  // Turn the whole body to face the other way.
  moves.push((s) => ({ ...s, across: [-s.across[0], s.across[1], -s.across[2]] }));
  moves.push((s) => ({ ...s, across: [s.across[2], s.across[1], -s.across[0]] }));
  return moves;
}

/** The bones worth nudging: limbs and neck for a humanoid, anything with a child otherwise. */
function adjustableBones(bones: THREE.Bone[]) {
  try {
    const rig = mapHumanoid(bones);
    const limbs: THREE.Bone[] = [];
    for (const side of ["l", "r"] as const) {
      for (const limb of [
        rig.thigh[side],
        rig.calf[side],
        rig.foot[side],
        rig.upperArm[side],
        rig.foreArm[side],
      ]) {
        if (limb) limbs.push(limb.bone);
      }
    }
    if (rig.neck) limbs.push(rig.neck.bone);
    return limbs;
  } catch {
    return bones.filter((b) => b.children.some((c) => c instanceof THREE.Bone));
  }
}

const axis = new THREE.Vector3();
const delta = new THREE.Quaternion();

/** Nudges 1 to 3 random limbs at once by up to `stepRadians` about random axes. */
function perturb(limbs: THREE.Bone[], stepRadians: number) {
  const count = Math.min(limbs.length, 1 + Math.floor(Math.random() * 3));
  const picked = [...limbs].sort(() => Math.random() - 0.5).slice(0, count);
  for (const bone of picked) {
    axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    delta.setFromAxisAngle(axis, (Math.random() * 2 - 1) * stepRadians);
    // Goes through the joint limits, so a candidate can never be an impossible body.
    applyWorldRotation(bone, delta);
  }
}

/**
 * Hill-climbs one model's pose toward a target.
 *
 * Each round builds several candidates, shows Jev every one of them from a
 * couple of angles, and asks it to pick a winner -- with the pose we already
 * have among the options, so a round can hold but never make things worse.
 * Candidates come first from a shuffled pool of structured edits (see
 * `structuredCandidates`), which fix the depth and facing errors pose
 * estimation actually makes; once those are spent it falls back to random
 * multi-limb nudges that shrink as they stop paying off. The model must already
 * be in the pose to improve, and is left in the best pose found.
 */
export async function refinePose(args: {
  side: Side;
  target: Target;
  settings: MotionSettings;
  onProgress?: (p: RefineProgress) => void;
}): Promise<{ match: number; quats: PoseQuats; converged: boolean; startMatch: number }> {
  const { side, target, settings, onProgress } = args;
  const { viewport } = useAtmosphereStore.getState();
  const bones = bonesOf(side);
  if (!viewport || bones.length === 0) throw new Error("Load a model first.");

  const views = () => Promise.all(VIEWS.map((yaw) => viewport.capture(side, yaw)));

  const limbs = adjustableBones(bones);
  let best = snapshotPose(bones);
  let step = settings.stepDegrees;

  // Only poses the rig can be read as segments can take the structured edits.
  let baseSegments: PoseSegments | null = null;
  try {
    baseSegments = measureSegments(bones, viewport.camera);
  } catch {
    baseSegments = null;
  }
  const pending = baseSegments ? structuredCandidates().sort(() => Math.random() - 0.5) : [];

  const startMatch = settings.iterations > 0 ? await score(await viewport.capture(side), target) : 0;

  for (let round = 1; round <= settings.iterations; round++) {
    // The pose we already have goes in as option 1, so a round can only ever
    // hold or improve: Jev is never forced to pick something worse.
    const poses: PoseQuats[] = [best];
    restorePose(bones, best);
    const shots: string[][] = [await views()];

    for (let k = 0; k < settings.candidates; k++) {
      const move = pending.pop();
      if (move && baseSegments) {
        // Rebuild from rest so the measured segments define the pose outright.
        resetToRest(bones);
        applySegmentsToRig(bones, move(baseSegments), viewport.camera);
      } else {
        restorePose(bones, best);
        perturb(limbs, THREE.MathUtils.degToRad(step));
      }
      poses.push(snapshotPose(bones));
      shots.push(await views());
    }

    const winner = await rank(shots, target);
    const changed = winner > 0;
    if (changed) {
      best = poses[winner];
      restorePose(bones, best);
      // The accepted pose is the new base for later structured edits.
      try {
        baseSegments = measureSegments(bones, viewport.camera);
      } catch {
        baseSegments = null;
      }
    } else if (pending.length === 0) {
      // Nothing beat what we have and the structured moves are spent; aim smaller.
      step = Math.max(step * 0.75, MIN_STEP_DEGREES);
    }
    onProgress?.({ round, rounds: settings.iterations, match: changed ? 1 : 0 });
  }

  restorePose(bones, best);
  const match = settings.iterations > 0 ? await score(await viewport.capture(side), target) : 0;
  console.info(
    `[refine] ${side} ${target.reference ? "photo" : "text"}: ${startMatch.toFixed(2)} -> ${match.toFixed(2)}`
  );
  return { match, quats: best, converged: match >= MATCH_THRESHOLD, startMatch };
}
