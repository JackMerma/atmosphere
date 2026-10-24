import * as THREE from "three";
import { classifyBone, type Part } from "@/lib/humanoidRig";

/**
 * Per-segment range of motion, in degrees, relative to the rest pose.
 * `twist` is rotation about the bone's own axis (the "unscrewing a jar" motion
 * that makes limbs corkscrew); `swing` is how far the bone may tilt away from
 * its rest direction.
 */
const LIMITS: Record<Part, { twist: number; swing: number }> = {
  upperArm: { twist: 70, swing: 175 },
  foreArm: { twist: 80, swing: 150 },
  thigh: { twist: 40, swing: 130 },
  calf: { twist: 10, swing: 150 },
  foot: { twist: 25, swing: 70 },
  neck: { twist: 50, swing: 55 },
};

const rest = new THREE.Quaternion();
const delta = new THREE.Quaternion();
const twist = new THREE.Quaternion();
const swing = new THREE.Quaternion();
const axis = new THREE.Vector3();
const vector = new THREE.Vector3();

const rad = THREE.MathUtils.degToRad;

/**
 * Keeps a limb bone inside its range of motion by splitting its rotation (from
 * rest) into swing and twist about the bone's axis, then clamping each. Moving
 * a limb from side to side is untouched; it just can't corkscrew into a
 * deformed shape. Bones that aren't recognised limb segments are left alone.
 */
export function constrainBone(bone: THREE.Bone) {
  const part = classifyBone(bone.name);
  const restArray = bone.userData.restQuaternion as number[] | undefined;
  const child = bone.children.find((c): c is THREE.Bone => c instanceof THREE.Bone);
  if (!part || !restArray || !child) return;

  axis.copy(child.position);
  if (axis.lengthSq() < 1e-12) return;
  axis.normalize();

  // Rotation away from rest, expressed in the bone's rest frame: delta = swing * twist.
  rest.fromArray(restArray);
  delta.copy(rest).invert().multiply(bone.quaternion);
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);

  vector.set(delta.x, delta.y, delta.z).projectOnVector(axis);
  twist.set(vector.x, vector.y, vector.z, delta.w);
  if (twist.lengthSq() < 1e-12) twist.identity();
  else twist.normalize();
  swing.copy(delta).multiply(twist.clone().invert());

  const { twist: maxTwist, swing: maxSwing } = LIMITS[part];
  let changed = false;

  const twistAngle = 2 * Math.atan2(vector.dot(axis), twist.w);
  const wrapped = Math.atan2(Math.sin(twistAngle), Math.cos(twistAngle));
  if (Math.abs(wrapped) > rad(maxTwist)) {
    twist.setFromAxisAngle(axis, Math.sign(wrapped) * rad(maxTwist));
    changed = true;
  }

  if (swing.w < 0) swing.set(-swing.x, -swing.y, -swing.z, -swing.w);
  const swingAngle = 2 * Math.acos(Math.min(1, swing.w));
  if (swingAngle > rad(maxSwing)) {
    vector.set(swing.x, swing.y, swing.z).normalize();
    swing.setFromAxisAngle(vector, rad(maxSwing));
    changed = true;
  }

  if (changed) bone.quaternion.copy(rest).multiply(swing).multiply(twist);
}
