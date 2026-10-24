import * as THREE from "three";
import { anchorFor, isAnchored } from "@/lib/anchor";
import { mapHumanoid, type HumanoidRig, type Limb } from "@/lib/humanoidRig";

/**
 * One body part, approximated as a capsule running from a bone to the joint
 * below it. Rotating `bone` sweeps the whole capsule around its own joint.
 */
interface Body {
  key: string;
  bone: THREE.Bone;
  tip: THREE.Object3D;
  radius: number;
  /** The root and the torso hold still; pushing them would swing the whole body. */
  movable: boolean;
}

interface CollisionRig {
  bodies: Body[];
  /** Index pairs that are allowed to touch, because they meet at a joint. */
  pairs: [number, number][];
}

/**
 * How thick each part is, as a fraction of its own length. Limbs are slim;
 * a torso is wide, and arms must clear it rather than pass through it.
 */
const THICKNESS = { limb: 0.19, leg: 0.22, torso: 0.34, head: 0.5 };

/** Overlap smaller than this fraction of the bodies' combined radius is left alone. */
const TOLERANCE = 0.04;

/**
 * How much of a detected overlap is actually corrected, 0 (limbs pass through
 * each other freely) to 1 (fully rigid, the original always-on behaviour).
 * Module state, like `jointLimits`' strength dial: read on every settle, which
 * must not reach into React.
 */
let collisionStrength = 1;

export function setCollisionStrength(value: number) {
  collisionStrength = Math.min(1, Math.max(0, value));
}

export function getCollisionStrength() {
  return collisionStrength;
}

const start = new THREE.Vector3();
const end = new THREE.Vector3();

function makeBody(
  key: string,
  limb: Limb | undefined,
  fraction: number,
  movable: boolean
): Body | null {
  if (!limb?.child) return null;
  limb.bone.getWorldPosition(start);
  limb.child.getWorldPosition(end);
  const length = start.distanceTo(end);
  if (length < 1e-6) return null;
  return { key, bone: limb.bone, tip: limb.child, radius: length * fraction, movable };
}

/** Builds the capsule set from the rest pose; radii come from the model's own proportions. */
function buildRig(bones: THREE.Bone[]): CollisionRig | null {
  let rig: HumanoidRig;
  try {
    rig = mapHumanoid(bones);
  } catch {
    return null;
  }

  const bodies: Body[] = [];
  const push = (b: Body | null) => {
    if (b) bodies.push(b);
  };

  // The torso is one fixed obstacle from the hips up to the neck or the shoulders.
  const torsoTop = rig.neck?.bone ?? rig.upperArm.l.bone;
  push(makeBody("torso", { bone: rig.hips, child: torsoTop }, THICKNESS.torso, false));
  push(makeBody("head", rig.neck, THICKNESS.head, true));

  for (const side of ["l", "r"] as const) {
    push(makeBody(`upperArm_${side}`, rig.upperArm[side], THICKNESS.limb, true));
    push(makeBody(`foreArm_${side}`, rig.foreArm[side], THICKNESS.limb, true));
    push(makeBody(`thigh_${side}`, rig.thigh[side], THICKNESS.leg, true));
    push(makeBody(`calf_${side}`, rig.calf[side], THICKNESS.leg, true));
  }

  // Parts that meet at a joint, or hang off the torso, always touch; the rest must not.
  const attached = (a: Body, b: Body) =>
    a.tip === b.bone ||
    b.tip === a.bone ||
    a.bone === b.bone ||
    (a.key === "torso" && b.key !== "foreArm_l" && b.key !== "foreArm_r" && b.key !== "calf_l" && b.key !== "calf_r") ||
    (b.key === "torso" && a.key !== "foreArm_l" && a.key !== "foreArm_r" && a.key !== "calf_l" && a.key !== "calf_r");

  const pairs: [number, number][] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (!attached(bodies[i], bodies[j])) pairs.push([i, j]);
    }
  }
  return { bodies, pairs };
}

/** Rebuilt only when the skeleton changes; keyed on the root bone, which outlives a pose. */
const rigs = new WeakMap<THREE.Bone, CollisionRig | null>();

function rigFor(bones: THREE.Bone[]) {
  if (bones.length === 0) return null;
  const root = bones[0];
  if (!rigs.has(root)) rigs.set(root, buildRig(bones));
  return rigs.get(root) ?? null;
}

const p1 = new THREE.Vector3();
const q1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const q2 = new THREE.Vector3();
const d1 = new THREE.Vector3();
const d2 = new THREE.Vector3();
const r = new THREE.Vector3();
const closestA = new THREE.Vector3();
const closestB = new THREE.Vector3();
const normal = new THREE.Vector3();
const pivot = new THREE.Vector3();
const arm = new THREE.Vector3();
const axis = new THREE.Vector3();
const spin = new THREE.Quaternion();

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Closest points between two segments, written into `closestA` and `closestB`.
 * Standard clamped-parameter solve; parallel segments fall back to their starts.
 */
function closestPoints() {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;

  if (a > 1e-9 && e > 1e-9) {
    const c = d1.dot(r);
    const b = d1.dot(d2);
    const denom = a * e - b * b;
    s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
    t = clamp01((b * s + f) / e);
    s = clamp01((b * t - c) / a);
  } else if (e > 1e-9) {
    t = clamp01(f / e);
  } else if (a > 1e-9) {
    s = clamp01(-d1.dot(r) / a);
  }

  closestA.copy(d1).multiplyScalar(s).add(p1);
  closestB.copy(d2).multiplyScalar(t).add(p2);
}

/** How far up the chain a push may travel when the joint below it cannot help. */
const LIFT = 2;
/** A pivot is useful only if a rotation about it moves the point mostly the right way. */
const USEFUL = 0.35;

const boneAxis = new THREE.Vector3();
const perpendicular = new THREE.Vector3();
const parentWorld = new THREE.Quaternion();
const boneWorld = new THREE.Quaternion();

/**
 * Rotates a joint so that `point` travels by `delta`.
 *
 * A rotation can only move a point sideways to the bone it hangs off, so when
 * the push runs along the bone -- a forearm driven straight into the chest --
 * the elbow is useless and the shoulder has to give way instead. This walks up
 * the chain until it finds a joint that can actually do the job, which is also
 * how a real arm reacts.
 */
function nudge(
  bone: THREE.Bone,
  point: THREE.Vector3,
  delta: THREE.Vector3,
  scale: number,
  anchor: THREE.Bone | null
) {
  const wanted = delta.length();
  if (wanted < 1e-7) return;

  let joint: THREE.Bone | null = bone;
  for (let lift = 0; joint && !isAnchored(joint, anchor) && lift <= LIFT; lift++) {
    joint.getWorldPosition(pivot);
    arm.subVectors(point, pivot);
    const reach = arm.length();
    if (reach > 1e-4) {
      boneAxis.copy(arm).divideScalar(reach);
      perpendicular.copy(delta).projectOnPlane(boneAxis);
      const usable = perpendicular.length();
      if (usable > wanted * USEFUL) {
        axis.crossVectors(arm, delta);
        if (axis.lengthSq() > 1e-12) {
          axis.normalize();
          spin.setFromAxisAngle(axis, (usable / reach) * scale);
          joint.getWorldQuaternion(boneWorld).premultiply(spin);
          if (joint.parent) {
            joint.parent.getWorldQuaternion(parentWorld).invert();
            joint.quaternion.multiplyQuaternions(parentWorld, boneWorld);
          } else {
            joint.quaternion.copy(boneWorld);
          }
          // Written straight onto the bone; the caller re-applies the joint limits.
          joint.updateMatrixWorld(true);
          return;
        }
      }
    }
    joint = joint.parent instanceof THREE.Bone ? joint.parent : null;
  }
}

/**
 * Pushes apart any two body parts that have sunk into each other, by rotating
 * them about their own joints. Returns the number of overlaps it found, so the
 * caller can stop early once the body is clear.
 *
 * Nothing here is scaled by the joint-limit dial: a body may bend like a rag
 * doll, but it should never pass through itself.
 */
export function resolveCollisions(bones: THREE.Bone[]): number {
  if (collisionStrength <= 0) return 0;
  const rig = rigFor(bones);
  if (!rig) return 0;
  const anchor = anchorFor(bones);

  let hits = 0;
  for (const [i, j] of rig.pairs) {
    const a = rig.bodies[i];
    const b = rig.bodies[j];
    if (!a.movable && !b.movable) continue;

    a.bone.getWorldPosition(p1);
    a.tip.getWorldPosition(q1);
    b.bone.getWorldPosition(p2);
    b.tip.getWorldPosition(q2);
    closestPoints();

    normal.subVectors(closestB, closestA);
    const distance = normal.length();
    const want = a.radius + b.radius;
    const overlap = want - distance;
    if (overlap <= want * TOLERANCE) continue;

    // Coincident centres have no separation direction; shove along the first bone.
    if (distance < 1e-6) normal.subVectors(q1, p1).normalize();
    else normal.divideScalar(distance);
    hits++;

    // Each movable part gives way by half; against the torso, one gives way fully.
    const share = a.movable && b.movable ? 0.5 : 1;
    const correction = overlap * collisionStrength;
    if (a.movable) nudge(a.bone, closestA, normal.clone().multiplyScalar(-correction), share, anchor);
    if (b.movable) nudge(b.bone, closestB, normal.clone().multiplyScalar(correction), share, anchor);
  }
  return hits;
}
