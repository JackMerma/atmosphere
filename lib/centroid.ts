import * as THREE from "three";
import { mapHumanoid } from "@/lib/humanoidRig";

const point = new THREE.Vector3();

/**
 * The model's pivot: the middle of its core (both hips and both shoulders) for
 * a humanoid, else the mean of all its bones. Limbs swinging around never move
 * it, so pinning it in place makes the model pose on the spot instead of drifting.
 */
export function coreCentroid(bones: THREE.Bone[], out = new THREE.Vector3()) {
  let anchors: THREE.Bone[];
  try {
    const rig = mapHumanoid(bones);
    anchors = [rig.thigh.l.bone, rig.thigh.r.bone, rig.upperArm.l.bone, rig.upperArm.r.bone];
  } catch {
    anchors = bones;
  }
  out.set(0, 0, 0);
  for (const bone of anchors) out.add(bone.getWorldPosition(point));
  return out.divideScalar(anchors.length);
}
