import * as THREE from "three";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { applyWorldRotation, collectBones } from "@/lib/boneMath";
import type { Direction, StepResult } from "@/lib/jevClient";
import type { PlannedPose } from "@/lib/geminiClient";
import { applySegmentsToRig, measureSegments, type PoseSegments } from "@/lib/poseRetarget";

export const MATCH_THRESHOLD = 0.7;
const MIN_STEP_DEGREES = 4;

/** User-tunable convergence limits, set from the Motion panel. */
export interface MotionSettings {
  /** Max Jev round-trips per pose. */
  iterations: number;
  /** First refinement rotation tried on a joint (after the pose is applied); reversals halve it, repeats grow it up to 2x. */
  stepDegrees: number;
}

export const ITERATIONS_RANGE = { min: 5, max: 20, default: 10 };
export const STEP_RANGE = { min: 5, max: 90, default: 20 };
export const DEFAULT_SETTINGS: MotionSettings = {
  iterations: ITERATIONS_RANGE.default,
  stepDegrees: STEP_RANGE.default,
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
  toward_viewer: "away_from_viewer",
  away_from_viewer: "toward_viewer",
};

/** Tracks, per joint, the last direction tried and the current step size. */
type StepMemory = Map<string, { direction: Direction; degrees: number }>;

/**
 * Big steps first; when Jev reverses a joint's direction we overshot, so halve
 * that joint's step; when it repeats the same direction we undershot, so grow it.
 */
function nextStepDegrees(
  memory: StepMemory,
  joint: string,
  direction: Direction,
  initial: number
) {
  const previous = memory.get(joint);
  let degrees = previous ? previous.degrees : initial;
  if (previous && previous.direction === OPPOSITE[direction]) {
    degrees = Math.max(degrees / 2, MIN_STEP_DEGREES);
  } else if (previous && previous.direction === direction) {
    degrees = Math.min(degrees * 1.5, initial * 2);
  }
  memory.set(joint, { direction, degrees });
  return degrees;
}

export interface Keyframe {
  pose: string;
  match: number;
  converged: boolean;
  /**
   * Local rotation (x, y, z, w) of every bone, in `collectBones` order. Indexed
   * rather than keyed by uuid because uuids change every time a file is parsed.
   */
  quats: [number, number, number, number][];
}

export interface Progress {
  poseIndex: number;
  poseCount: number;
  iteration: number;
  match: number | null;
  adjustment: string | null;
  tokens: number | null;
}

interface Candidate {
  key: string;
  bone: THREE.Bone;
  child: THREE.Bone;
  description: string;
}

function humanize(name: string) {
  return name
    .replace(/^mixamorig/i, "")
    .replace(/_\d+$/, "")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .trim();
}

/** Joints Jev may move: only ones with a child bone, so "swing the limb" has a direction. */
function buildCandidates(bones: THREE.Bone[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const bone of bones) {
    const child = bone.children.find((c): c is THREE.Bone => c instanceof THREE.Bone);
    if (!child) continue;
    let key = bone.name || bone.uuid;
    if (seen.has(key)) key = `${key}_${bone.uuid.slice(0, 4)}`;
    seen.add(key);
    out.push({ key, bone, child, description: `The ${humanize(bone.name)} joint` });
  }
  return out;
}

function snapshot(bones: THREE.Bone[]) {
  return bones.map((b) => b.quaternion.toArray() as [number, number, number, number]);
}

function restore(bones: THREE.Bone[], quats: number[][]) {
  bones.forEach((b, i) => b.quaternion.fromArray(quats[i]));
  bones.forEach((b) => b.updateMatrixWorld(true));
}

export function snapshotPose(bones: THREE.Bone[]) {
  return snapshot(bones);
}

/** Puts the model in the pose Motion starts from: the saved initial state, else the rest pose. */
function restoreStartPose(bones: THREE.Bone[]) {
  const { initialState } = useAtmosphereStore.getState();
  if (initialState && initialState.length === bones.length) restore(bones, initialState);
  else resetToRest(bones);
}

/**
 * Restores the start pose and reads it as segment directions for Gemini to
 * build on. Null when the skeleton isn't recognisable as a humanoid.
 */
export function startingSegments(): PoseSegments | null {
  const { scene, viewport } = useAtmosphereStore.getState();
  if (!scene || !viewport) return null;
  const bones = collectBones(scene);
  restoreStartPose(bones);
  try {
    return measureSegments(bones, viewport.camera);
  } catch {
    return null;
  }
}

export function resetToRest(bones: THREE.Bone[]) {
  restore(
    bones,
    bones.map((b) => b.userData.restQuaternion ?? b.quaternion.toArray())
  );
}

const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const camBack = new THREE.Vector3();
const boneWorld = new THREE.Vector3();
const childWorld = new THREE.Vector3();
const limbDir = new THREE.Vector3();
const target = new THREE.Vector3();
const delta = new THREE.Quaternion();

function applyAdjustment(
  candidate: Candidate,
  direction: Direction,
  camera: THREE.Camera,
  stepRadians: number
) {
  camera.updateMatrixWorld(true);
  camera.matrixWorld.extractBasis(camRight, camUp, camBack);

  const toward = {
    up: camUp.clone(),
    down: camUp.clone().negate(),
    right: camRight.clone(),
    left: camRight.clone().negate(),
    toward_viewer: camBack.clone(),
    away_from_viewer: camBack.clone().negate(),
  }[direction];

  candidate.bone.getWorldPosition(boneWorld);
  candidate.child.getWorldPosition(childWorld);
  limbDir.subVectors(childWorld, boneWorld);
  if (limbDir.lengthSq() < 1e-10) return;
  limbDir.normalize();

  target
    .copy(limbDir)
    .multiplyScalar(Math.cos(stepRadians))
    .addScaledVector(toward, Math.sin(stepRadians))
    .normalize();
  delta.setFromUnitVectors(limbDir, target);
  applyWorldRotation(candidate.bone, delta);
}

async function requestStep(
  image: string,
  pose: string,
  candidates: Candidate[]
): Promise<StepResult> {
  const res = await fetch("/api/motion/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image,
      pose,
      joints: candidates.map((c) => ({ name: c.key, description: c.description })),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Motion step failed.");
  return data as StepResult;
}

/**
 * Drives the loaded model through each pose in order: render it, ask Jev how
 * well it matches, and if not, nudge one joint — up to `settings.iterations` per
 * pose. A pose that never matches keeps the best attempt. Starts from the
 * model's rest pose; if anything fails, the pose it had before is restored
 * and nothing is returned, so no partial result can be saved.
 */
export async function runMotion(
  poses: PlannedPose[],
  settings: MotionSettings,
  onProgress: (p: Progress) => void
): Promise<Keyframe[]> {
  const { scene, viewport } = useAtmosphereStore.getState();
  if (!scene || !viewport) throw new Error("Load a model first.");

  const bones = collectBones(scene);
  const candidates = buildCandidates(bones);
  if (candidates.length === 0) throw new Error("This model has no movable joints.");

  const before = snapshot(bones);
  try {
    return await converge(poses, settings, bones, candidates, viewport, onProgress);
  } catch (err) {
    restore(bones, before);
    throw err;
  }
}

async function converge(
  poses: PlannedPose[],
  settings: MotionSettings,
  bones: THREE.Bone[],
  candidates: Candidate[],
  viewport: NonNullable<ReturnType<typeof useAtmosphereStore.getState>["viewport"]>,
  onProgress: (p: Progress) => void
): Promise<Keyframe[]> {
  // Pose 1 starts from the learner's initial state when one was set, else the rest pose.
  restoreStartPose(bones);
  const keyframes: Keyframe[] = [];

  for (let p = 0; p < poses.length; p++) {
    const { text: pose, segments } = poses[p];

    // Gemini authored the whole pose: adopt it in one go, then let Jev judge and refine.
    if (segments) {
      try {
        applySegmentsToRig(bones, segments, viewport.camera);
      } catch {
        // Not a recognisable humanoid: Jev converges from the previous pose alone.
      }
    }

    let best = { match: -1, quats: snapshot(bones) };
    let converged = false;
    const memory: StepMemory = new Map();

    for (let i = 1; i <= settings.iterations; i++) {
      const image = await viewport.capture();
      const step = await requestStep(image, pose, candidates);

      console.info(
        `[motion] pose ${p + 1}/${poses.length} step ${i}: match=${step.match.toFixed(2)} ` +
          `next=${step.joint} ${step.direction} tokens=${step.usage?.input_tokens ?? "?"}`
      );
      if (step.match > best.match) best = { match: step.match, quats: snapshot(bones) };
      onProgress({
        poseIndex: p,
        poseCount: poses.length,
        iteration: i,
        match: step.match,
        adjustment: `${step.joint} → ${step.direction}`,
        tokens: step.usage?.input_tokens ?? null,
      });

      if (step.match >= MATCH_THRESHOLD) {
        converged = true;
        break;
      }
      if (i === settings.iterations) break;

      const candidate = candidates.find((c) => c.key === step.joint);
      if (candidate) {
        const degrees = nextStepDegrees(memory, step.joint, step.direction, settings.stepDegrees);
        applyAdjustment(candidate, step.direction, viewport.camera, THREE.MathUtils.degToRad(degrees));
      }
    }

    if (!converged) restore(bones, best.quats);
    keyframes.push({
      pose,
      match: best.match,
      converged,
      quats: snapshot(bones),
    });
  }

  return keyframes;
}
