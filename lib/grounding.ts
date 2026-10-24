import * as THREE from "three";
import { mapHumanoid } from "@/lib/humanoidRig";

/**
 * The points that decide where the floor is.
 *
 * Several per foot, not one: as the ankle rolls the toe lifts and the heel
 * drops, so whichever reference hangs lowest is the one carrying the weight.
 * Each remembers how far the model reached below it when standing at rest, so
 * the measurement means the same thing in every pose.
 */
interface Footing {
  references: { bone: THREE.Bone; drop: number }[];
}

const footings = new WeakMap<THREE.Bone, Footing | null>();

function measureFooting(model: THREE.Object3D, bones: THREE.Bone[]): Footing | null {
  let feet: THREE.Bone[];
  try {
    const rig = mapHumanoid(bones);
    feet = (["l", "r"] as const)
      .flatMap((side) => [rig.foot[side]?.bone, rig.foot[side]?.child, rig.calf[side]?.child])
      .filter((bone): bone is THREE.Bone => bone instanceof THREE.Bone);
  } catch {
    return null;
  }
  // The same bone can be both a foot and a shin's child; one entry each.
  feet = [...new Set(feet)];
  if (feet.length === 0) return null;

  model.updateMatrixWorld(true);
  const floor = new THREE.Box3().setFromObject(model).min.y;
  return {
    references: feet.map((bone) => ({
      bone,
      drop: bone.getWorldPosition(new THREE.Vector3()).y - floor,
    })),
  };
}

function footingFor(model: THREE.Object3D, bones: THREE.Bone[]) {
  if (bones.length === 0) return null;
  const key = bones[0];
  if (!footings.has(key)) footings.set(key, measureFooting(model, bones));
  return footings.get(key) ?? null;
}

const position = new THREE.Vector3();

/**
 * Stands the model on the floor by its lowest foot.
 *
 * This is where a walk gets its weight. Nothing here lifts or drops the hips
 * directly: the legs bend and straighten, the lowest foot would sink or rise,
 * and holding it on the floor pushes the whole body up and down instead. The
 * bob, the dip into a crouch and the lift out of it all fall out of one rule.
 *
 * Returns false when the model has no feet to stand on, so the caller can fall
 * back to holding it where it was.
 */
export function groundModel(model: THREE.Object3D, bones: THREE.Bone[]): boolean {
  const footing = footingFor(model, bones);
  if (!footing) return false;

  model.updateMatrixWorld(true);
  let lowest = Infinity;
  for (const { bone, drop } of footing.references) {
    lowest = Math.min(lowest, bone.getWorldPosition(position).y - drop);
  }
  if (!Number.isFinite(lowest)) return false;

  // The stage group carries no rotation or scale, so a world drop is a local one.
  model.position.y -= lowest;
  model.updateMatrixWorld(true);
  return true;
}
