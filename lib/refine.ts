import * as THREE from "three";
import { applyWorldRotation } from "@/lib/boneMath";
import { mapHumanoid, type Limb } from "@/lib/humanoidRig";
import type { MotionSettings } from "@/lib/motionSettings";
import type { BodyPart } from "@/lib/jevClient";
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

/** What Jev compares the figure to: a written pose or a photo (as a data URL). */
export interface Target {
  text?: string;
  reference?: string;
  /**
   * The exact directions the pose asks for, when the planner authored it.
   * Present means attention can be measured instead of guessed at.
   */
  segments?: PoseSegments;
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
 * rather than one bone in isolation. The names are the ones Jev is asked to
 * choose between when attention has to come from a picture.
 */
const CHAINS: { part: BodyPart; segments: (keyof PoseSegments)[] }[] = [
  { part: "left arm", segments: ["upper_arm_l", "forearm_l"] },
  { part: "right arm", segments: ["upper_arm_r", "forearm_r"] },
  { part: "left leg", segments: ["thigh_l", "shin_l", "foot_l"] },
  { part: "right leg", segments: ["thigh_r", "shin_r", "foot_r"] },
  { part: "head", segments: ["head_up"] },
  { part: "torso", segments: ["torso_up"] },
];

/** The bones each body part is made of, for a humanoid rig. */
function bonesByPart(bones: THREE.Bone[]): Map<BodyPart, THREE.Bone[]> {
  const parts = new Map<BodyPart, THREE.Bone[]>();
  try {
    const rig = mapHumanoid(bones);
    const add = (part: BodyPart, limbs: (Limb | undefined)[]) => {
      const found = limbs.filter((l): l is Limb => !!l).map((l) => l.bone);
      if (found.length) parts.set(part, found);
    };
    for (const side of ["l", "r"] as const) {
      const name = side === "l" ? "left" : "right";
      add(`${name} arm` as BodyPart, [rig.upperArm[side], rig.foreArm[side]]);
      add(`${name} leg` as BodyPart, [rig.thigh[side], rig.calf[side], rig.foot[side]]);
    }
    add("head", [rig.neck]);
  } catch {
    // Not a humanoid: there is nothing to focus on, so every bone stays in play.
  }
  return parts;
}

const angleBetween = (a: Vec3, b: Vec3) =>
  new THREE.Vector3(...a).angleTo(new THREE.Vector3(...b));

/**
 * Which parts of the body are furthest from the pose being aimed at, worst
 * first.
 *
 * When the planner authored the pose it also gave the exact direction every
 * segment should point, so the parts that need work can simply be measured.
 * That is free, exact, and sharper than anything a judge could read off a
 * picture -- an arm overlapping the torso looks the same from the front
 * whichever way it points.
 */
function attentionFromSegments(current: PoseSegments, target: PoseSegments): BodyPart[] {
  const errors = CHAINS.map(({ part, segments }) => {
    let worst = 0;
    for (const key of segments) {
      const a = current[key] as Vec3 | undefined;
      const b = target[key] as Vec3 | undefined;
      if (a && b) worst = Math.max(worst, angleBetween(a, b));
    }
    return { part, worst };
  });
  return errors
    .filter((e) => e.worst > THREE.MathUtils.degToRad(5))
    .sort((a, b) => b.worst - a.worst)
    .map((e) => e.part);
}

/** Asks Jev which part looks most wrong, for poses that only have a photo to go on. */
async function attentionFromJev(views: string[], reference: string): Promise<BodyPart[]> {
  const res = await fetch("/api/motion/attention", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ views, reference }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Jev could not say what to look at.");
  return [data.part as BodyPart];
}

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
function structuredCandidates(
  focus: BodyPart[]
): ((segments: PoseSegments) => PoseSegments)[] {
  // Parts attention named come first, in the order it named them.
  const ordered = [...CHAINS].sort(
    (a, b) =>
      (focus.indexOf(a.part) + 1 || CHAINS.length + 1) -
      (focus.indexOf(b.part) + 1 || CHAINS.length + 1)
  );

  const moves: ((segments: PoseSegments) => PoseSegments)[] = [];
  for (const { segments: chain } of ordered) {
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

/** How often a random nudge ignores attention, in case it is pointing at the wrong part. */
const STRAY = 0.2;

/**
 * Nudges 1 to 3 limbs at once by up to `stepRadians` about random axes,
 * drawn from the parts attention is on so the effort lands where the pose is
 * wrong. Occasionally it strays, so a part attention overlooked is never
 * locked out of the search.
 */
function perturb(limbs: THREE.Bone[], focused: THREE.Bone[], stepRadians: number) {
  const pool = focused.length > 0 && Math.random() > STRAY ? focused : limbs;
  const count = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
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
  const partBones = bonesByPart(bones);
  let best = snapshotPose(bones);
  let step = settings.stepDegrees;

  // Only poses the rig can be read as segments can take the structured edits.
  const measure = () => {
    try {
      return measureSegments(bones, viewport.camera);
    } catch {
      return null;
    }
  };
  let baseSegments = measure();

  /**
   * Where the search should spend its effort. Measured against the planner's
   * own vectors when there are any; otherwise Jev is asked to name the part
   * that looks furthest off, which is the one judgement a picture can settle.
   */
  let focus: BodyPart[] = [];
  const look = async (shot?: string[]) => {
    if (target.segments && baseSegments) {
      focus = attentionFromSegments(baseSegments, target.segments);
    } else if (target.reference) {
      try {
        focus = await attentionFromJev(shot ?? (await views()), target.reference);
      } catch {
        focus = [];
      }
    }
  };
  await look();
  const focusedBones = () => focus.flatMap((part) => partBones.get(part) ?? []);

  const pending = baseSegments ? structuredCandidates(focus) : [];

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
        perturb(limbs, focusedBones(), THREE.MathUtils.degToRad(step));
      }
      poses.push(snapshotPose(bones));
      shots.push(await views());
    }

    const winner = await rank(shots, target);
    const changed = winner > 0;
    if (changed) {
      best = poses[winner];
      restorePose(bones, best);
      // The accepted pose is the new base for later edits, and moves attention
      // on to whatever is furthest off now.
      baseSegments = measure();
      await look(shots[winner]);
    } else if (pending.length === 0) {
      // Nothing beat what we have and the structured moves are spent; aim smaller.
      step = Math.max(step * 0.75, MIN_STEP_DEGREES);
    }
    onProgress?.({ round, rounds: settings.iterations, match: changed ? 1 : 0 });
  }

  restorePose(bones, best);
  const match = settings.iterations > 0 ? await score(await viewport.capture(side), target) : 0;
  console.info(
    `[refine] ${side} ${target.reference ? "photo" : "text"}: ` +
      `${startMatch.toFixed(2)} -> ${match.toFixed(2)} (last focus: ${focus.join(", ") || "none"})`
  );
  return { match, quats: best, converged: match >= MATCH_THRESHOLD, startMatch };
}

/** Internals reached by the numeric tests; not part of the module's own surface. */
export const __testing = { attentionFromSegments, structuredCandidates };
