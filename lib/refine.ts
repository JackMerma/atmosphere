import * as THREE from "three";
import { applyWorldRotation } from "@/lib/boneMath";
import { mapHumanoid } from "@/lib/humanoidRig";
import { bonesOf, restorePose, snapshotPose, type PoseQuats } from "@/lib/pose";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

/** A pose scoring at least this is considered matched; refinement stops there. */
export const MATCH_THRESHOLD = 0.7;
const MIN_STEP_DEGREES = 3;
const MIN_GAIN = 0.005;

/** Tunable from the Motion section. */
export interface MotionSettings {
  /** Refinement rounds per judged pose. */
  iterations: number;
  /** Candidate poses tried (and judged in parallel) each round. */
  candidates: number;
  /** Largest rotation, in degrees, a round may apply to a limb. */
  stepDegrees: number;
}

export const ITERATIONS_RANGE = { min: 5, max: 50, default: 10 };
export const CANDIDATES_RANGE = { min: 2, max: 8, default: 4 };
export const STEP_RANGE = { min: 5, max: 60, default: 20 };
export const DEFAULT_SETTINGS: MotionSettings = {
  iterations: ITERATIONS_RANGE.default,
  candidates: CANDIDATES_RANGE.default,
  stepDegrees: STEP_RANGE.default,
};

/** What Jev compares the figure to: a written pose or a photo (as a data URL). */
export interface Target {
  text?: string;
  reference?: string;
}

export interface RefineProgress {
  round: number;
  rounds: number;
  /** Best score so far. */
  match: number;
}

async function judge(image: string, target: Target): Promise<number> {
  const res = await fetch("/api/motion/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, text: target.text, reference: target.reference }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Jev could not judge the pose.");
  return data.match as number;
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
 * Hill-climbs one model's pose toward a target. Each round it builds several
 * candidates that move a few limbs at once, renders and judges them all in
 * parallel with Jev, and keeps the best only if it beats the current pose;
 * otherwise it takes smaller steps. The model must already be in the pose to
 * improve; it is left in the best pose found.
 */
export async function refinePose(args: {
  side: Side;
  target: Target;
  settings: MotionSettings;
  onProgress?: (p: RefineProgress) => void;
}): Promise<{ match: number; quats: PoseQuats; converged: boolean }> {
  const { side, target, settings, onProgress } = args;
  const { viewport } = useAtmosphereStore.getState();
  const bones = bonesOf(side);
  if (!viewport || bones.length === 0) throw new Error("Load a model first.");

  const limbs = adjustableBones(bones);
  let best = snapshotPose(bones);
  let bestScore = await judge(await viewport.capture(side), target);
  let step = settings.stepDegrees;

  for (let round = 1; round <= settings.iterations && bestScore < MATCH_THRESHOLD; round++) {
    const candidates: PoseQuats[] = [];
    const images: string[] = [];
    for (let k = 0; k < settings.candidates; k++) {
      restorePose(bones, best);
      perturb(limbs, THREE.MathUtils.degToRad(step));
      candidates.push(snapshotPose(bones));
      images.push(await viewport.capture(side));
    }

    const scores = await Promise.all(images.map((image) => judge(image, target)));
    const top = scores.indexOf(Math.max(...scores));
    if (scores[top] > bestScore + MIN_GAIN) {
      best = candidates[top];
      bestScore = scores[top];
    } else {
      step = Math.max(step * 0.75, MIN_STEP_DEGREES);
    }
    onProgress?.({ round, rounds: settings.iterations, match: bestScore });
  }

  restorePose(bones, best);
  return { match: bestScore, quats: best, converged: bestScore >= MATCH_THRESHOLD };
}
