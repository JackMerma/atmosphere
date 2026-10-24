import * as THREE from "three";
import { mapHumanoid, type Side } from "@/lib/humanoidRig";

/**
 * How much lower the other foot has to be before the weight is said to have
 * moved onto it.
 *
 * Without a margin the two feet trade places from one sample to the next as
 * they cross, and every trade throws away a sample of travel. Models are
 * normalised to a standard height (2.6), so this is a fixed fraction of a body.
 */
const SWITCH_MARGIN = 0.03;

/** The reference points of one foot, and how far the model reached below each at rest. */
interface Foot {
  references: { bone: THREE.Bone; drop: number }[];
}

const feet = new WeakMap<THREE.Bone, Record<Side, Foot> | null>();

/**
 * The points that decide where each foot is, measured per side.
 *
 * Several per foot, as in `grounding.ts`: as the ankle rolls the toe lifts and
 * the heel drops, so whichever reference hangs lowest is the one carrying the
 * weight. The difference here is that they are kept apart by side, because the
 * question is not where the floor is but WHICH foot is standing on it.
 */
function measureFeet(model: THREE.Object3D, bones: THREE.Bone[]): Record<Side, Foot> | null {
  let rig;
  try {
    rig = mapHumanoid(bones);
  } catch {
    return null;
  }
  // Measured in the REST pose, not in whatever pose the model happens to be in
  // the first time this is asked: the drop is how far the model reaches below a
  // bone, and in a crouch that is a different number for the same foot.
  const held = bones.map((bone) => bone.quaternion.clone());
  for (const bone of bones) {
    const resting = bone.userData.restQuaternion as number[] | undefined;
    if (resting) bone.quaternion.fromArray(resting);
  }
  model.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(model).min.y;

  const sides = {} as Record<Side, Foot>;
  for (const side of ["l", "r"] as const) {
    const refs = [rig.foot[side]?.bone, rig.foot[side]?.child, rig.calf[side]?.child].filter(
      (bone): bone is THREE.Bone => bone instanceof THREE.Bone
    );
    const unique = [...new Set(refs)];
    if (unique.length === 0) return null;
    sides[side] = {
      references: unique.map((bone) => ({
        bone,
        drop: bone.getWorldPosition(new THREE.Vector3()).y - floor,
      })),
    };
  }

  bones.forEach((bone, i) => bone.quaternion.copy(held[i]));
  model.updateMatrixWorld(true);
  return sides;
}

function feetFor(model: THREE.Object3D, bones: THREE.Bone[]) {
  if (bones.length === 0) return null;
  const key = bones[0];
  if (!feet.has(key)) feet.set(key, measureFeet(model, bones));
  return feet.get(key) ?? null;
}

const point = new THREE.Vector3();

export interface Support {
  side: Side;
  /** Where that foot touches, in world space. */
  contact: THREE.Vector3;
  /** How far above the floor it sits; 0 when it is standing on it. */
  height: number;
}

/**
 * Which foot is carrying the weight right now, and where it is touching.
 *
 * The lowest reference point of each foot is compared, and the lower foot wins.
 * `previous` is the side that had the weight a moment ago, which only has to be
 * beaten by `SWITCH_MARGIN` -- otherwise the answer flickers as the feet cross.
 */
export function supportFoot(
  model: THREE.Object3D,
  bones: THREE.Bone[],
  previous?: Side
): Support | null {
  const sides = feetFor(model, bones);
  if (!sides) return null;
  model.updateMatrixWorld(true);

  let best: Support | null = null;
  for (const side of ["l", "r"] as const) {
    let lowest = Infinity;
    const contact = new THREE.Vector3();
    for (const { bone, drop } of sides[side].references) {
      const y = bone.getWorldPosition(point).y - drop;
      if (y < lowest) {
        lowest = y;
        contact.copy(point).setY(y);
      }
    }
    if (!Number.isFinite(lowest)) continue;
    // The foot that had the weight keeps it until the other is clearly lower.
    const bias = side === previous ? -SWITCH_MARGIN : 0;
    if (!best || lowest + bias < best.height) best = { side, contact, height: lowest + bias };
  }
  if (best) best.height = best.contact.y;
  return best;
}

/**
 * The ground the figure walks on, so travel can be applied to it.
 *
 * A walk's root motion is put into the floor rather than into the figure. The
 * grid is uniform and endless, so sliding it is indistinguishable from the
 * figure crossing it, and it keeps the figure in frame however long the
 * animation loops -- where moving the figure walks it out of shot in a few
 * seconds and fights the lock that holds each body over its spot on the stage.
 */
let ground: THREE.Object3D | null = null;

export function registerGround(object: THREE.Object3D | null) {
  ground = object;
}

/** Slides the ground so the planted foot stays where it was put. */
export function placeGround(offset: THREE.Vector3) {
  if (!ground) return;
  ground.position.set(offset.x, ground.position.y, offset.z);
  ground.updateMatrixWorld(true);
}

export const GROUND_AT_REST = new THREE.Vector3();
