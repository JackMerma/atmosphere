import * as THREE from "three";
import { applyWorldRotation } from "@/lib/boneMath";
import { mapHumanoid, type Limb, type Side } from "@/lib/humanoidRig";
import type { PoseLandmark } from "@/lib/poseEstimation";

/** MediaPipe pose landmark indices (left/right are the subject's own). */
const LM = {
  shoulder: { l: 11, r: 12 },
  elbow: { l: 13, r: 14 },
  wrist: { l: 15, r: 16 },
  hip: { l: 23, r: 24 },
  knee: { l: 25, r: 26 },
  ankle: { l: 27, r: 28 },
  toe: { l: 31, r: 32 },
} as const;

const SIDES: Side[] = ["l", "r"];

const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const camBack = new THREE.Vector3();

/** Landmark position in the camera's frame, so the pose matches what the viewer sees. */
function toWorld(lm: PoseLandmark, out = new THREE.Vector3()) {
  return out
    .set(0, 0, 0)
    .addScaledVector(camRight, lm.x)
    .addScaledVector(camUp, -lm.y) // image y points down
    .addScaledVector(camBack, -lm.z); // smaller z = closer to the camera
}

/** Orthonormal orientation from a sideways axis and an up axis (forward = across x up). */
function frame(across: THREE.Vector3, up: THREE.Vector3) {
  const y = up.clone().normalize();
  const x = across.clone().addScaledVector(y, -across.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const boneA = new THREE.Vector3();
const boneB = new THREE.Vector3();
const current = new THREE.Vector3();
const delta = new THREE.Quaternion();

/** Rotates `limb.bone` so it points from its own position toward `direction`. */
function aim(limb: Limb | undefined, direction: THREE.Vector3) {
  if (!limb?.child || direction.lengthSq() < 1e-10) return;
  limb.bone.getWorldPosition(boneA);
  limb.child.getWorldPosition(boneB);
  current.subVectors(boneB, boneA);
  if (current.lengthSq() < 1e-10) return;
  delta.setFromUnitVectors(current.normalize(), direction.clone().normalize());
  applyWorldRotation(limb.bone, delta);
}

/**
 * Poses the model's limbs to match the estimated landmarks. Orients the hips
 * (whole body lean / facing) first, then aims each bone parent-before-child.
 * Every landmark is used, occluded or not: the preview lets the user correct
 * the ones MediaPipe was unsure about.
 */
export function applyPoseToRig(
  bones: THREE.Bone[],
  landmarks: PoseLandmark[],
  camera: THREE.Camera
) {
  const rig = mapHumanoid(bones);

  camera.updateMatrixWorld(true);
  camera.matrixWorld.extractBasis(camRight, camUp, camBack);
  const at = (i: number) => toWorld(landmarks[i]);

  // Whole-body orientation: hip line (right hip -> left hip) and hips -> shoulders.
  {
    const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);
    const target = frame(
      at(LM.hip.l).sub(at(LM.hip.r)),
      mid(at(LM.shoulder.l), at(LM.shoulder.r)).sub(mid(at(LM.hip.l), at(LM.hip.r)))
    );

    const p = (limb: Limb) => limb.bone.getWorldPosition(new THREE.Vector3());
    rig.hips.updateWorldMatrix(true, true);
    const model = frame(
      p(rig.thigh.l).sub(p(rig.thigh.r)),
      mid(p(rig.upperArm.l), p(rig.upperArm.r)).sub(mid(p(rig.thigh.l), p(rig.thigh.r)))
    );
    delta.copy(target).multiply(model.invert());
    applyWorldRotation(rig.hips, delta);
  }

  const dir = (from: number, to: number) => at(to).sub(at(from));
  for (const s of SIDES) {
    aim(rig.thigh[s], dir(LM.hip[s], LM.knee[s]));
    aim(rig.calf[s], dir(LM.knee[s], LM.ankle[s]));
    aim(rig.foot[s], dir(LM.ankle[s], LM.toe[s]));
  }
  for (const s of SIDES) {
    aim(rig.upperArm[s], dir(LM.shoulder[s], LM.elbow[s]));
    aim(rig.foreArm[s], dir(LM.elbow[s], LM.wrist[s]));
  }
}
