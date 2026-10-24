import * as THREE from "three";
import { applyWorldRotation } from "@/lib/boneMath";
import { mapHumanoid, type HumanoidRig, type Limb, type Side } from "@/lib/humanoidRig";
import type { PoseLandmark } from "@/lib/poseEstimation";

/** Direction in the camera's frame: x = screen right, y = up, z = toward the viewer. */
export type Vec3 = [number, number, number];

/**
 * A whole-body pose as segment directions (start joint -> end joint), seen from
 * the camera. `l`/`r` are the character's own left and right. Shared by the
 * photo pipeline (from landmarks) and the prompt pipeline (written by Gemini).
 */
export interface PoseSegments {
  /** Character's right hip -> left hip. */
  across: Vec3;
  /** Hips -> shoulders. */
  torso_up: Vec3;
  upper_arm_l?: Vec3;
  forearm_l?: Vec3;
  upper_arm_r?: Vec3;
  forearm_r?: Vec3;
  thigh_l?: Vec3;
  shin_l?: Vec3;
  foot_l?: Vec3;
  thigh_r?: Vec3;
  shin_r?: Vec3;
  foot_r?: Vec3;
}

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

function loadCamera(camera: THREE.Camera) {
  camera.updateMatrixWorld(true);
  camera.matrixWorld.extractBasis(camRight, camUp, camBack);
}

/** Camera-frame vector -> world-space vector. */
function toWorld([x, y, z]: Vec3) {
  return new THREE.Vector3()
    .addScaledVector(camRight, x)
    .addScaledVector(camUp, y)
    .addScaledVector(camBack, z);
}

/** World-space vector -> camera-frame vector. */
function toCamera(v: THREE.Vector3): Vec3 {
  return [v.dot(camRight), v.dot(camUp), v.dot(camBack)];
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
function aim(limb: Limb | undefined, direction: Vec3 | undefined) {
  if (!limb?.child || !direction) return;
  const target = toWorld(direction);
  if (target.lengthSq() < 1e-10) return;
  limb.bone.getWorldPosition(boneA);
  limb.child.getWorldPosition(boneB);
  current.subVectors(boneB, boneA);
  if (current.lengthSq() < 1e-10) return;
  delta.setFromUnitVectors(current.normalize(), target.normalize());
  applyWorldRotation(limb.bone, delta);
}

const worldPosition = (limb: Limb) => limb.bone.getWorldPosition(new THREE.Vector3());
const midpoint = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

/** Direction from a limb's bone to its child, in the camera frame, rounded for prompts. */
function limbDirection(limb: Limb | undefined): Vec3 | undefined {
  if (!limb?.child) return undefined;
  const d = limb.child
    .getWorldPosition(new THREE.Vector3())
    .sub(limb.bone.getWorldPosition(new THREE.Vector3()));
  if (d.lengthSq() < 1e-10) return undefined;
  return toCamera(d.normalize()).map((n) => Math.round(n * 100) / 100) as Vec3;
}

/**
 * Poses the rig to match `segments`: orients the hips (whole-body lean and
 * facing) first, then aims each bone parent-before-child. Omitted segments are
 * left as they are.
 */
function poseRig(rig: HumanoidRig, segments: PoseSegments) {
  rig.hips.updateWorldMatrix(true, true);
  const modelFrame = frame(
    worldPosition(rig.thigh.l).sub(worldPosition(rig.thigh.r)),
    midpoint(worldPosition(rig.upperArm.l), worldPosition(rig.upperArm.r)).sub(
      midpoint(worldPosition(rig.thigh.l), worldPosition(rig.thigh.r))
    )
  );
  const targetFrame = frame(toWorld(segments.across), toWorld(segments.torso_up));
  delta.copy(targetFrame).multiply(modelFrame.invert());
  applyWorldRotation(rig.hips, delta);

  for (const s of SIDES) {
    aim(rig.thigh[s], segments[`thigh_${s}`]);
    aim(rig.calf[s], segments[`shin_${s}`]);
    aim(rig.foot[s], segments[`foot_${s}`]);
  }
  for (const s of SIDES) {
    aim(rig.upperArm[s], segments[`upper_arm_${s}`]);
    aim(rig.foreArm[s], segments[`forearm_${s}`]);
  }
}

/** Poses the model from written segment directions (e.g. authored by Gemini). */
export function applySegmentsToRig(
  bones: THREE.Bone[],
  segments: PoseSegments,
  camera: THREE.Camera
) {
  const rig = mapHumanoid(bones);
  loadCamera(camera);
  poseRig(rig, segments);
}

/** Reads the model's current pose as segment directions, as seen from the camera. */
export function measureSegments(bones: THREE.Bone[], camera: THREE.Camera): PoseSegments {
  const rig = mapHumanoid(bones);
  loadCamera(camera);
  rig.hips.updateWorldMatrix(true, true);

  const round = (v: Vec3) => v.map((n) => Math.round(n * 100) / 100) as Vec3;
  const across = toCamera(worldPosition(rig.thigh.l).sub(worldPosition(rig.thigh.r)).normalize());
  const torsoUp = toCamera(
    midpoint(worldPosition(rig.upperArm.l), worldPosition(rig.upperArm.r))
      .sub(midpoint(worldPosition(rig.thigh.l), worldPosition(rig.thigh.r)))
      .normalize()
  );

  const segments: PoseSegments = { across: round(across), torso_up: round(torsoUp) };
  for (const s of SIDES) {
    segments[`upper_arm_${s}`] = limbDirection(rig.upperArm[s]);
    segments[`forearm_${s}`] = limbDirection(rig.foreArm[s]);
    segments[`thigh_${s}`] = limbDirection(rig.thigh[s]);
    segments[`shin_${s}`] = limbDirection(rig.calf[s]);
    segments[`foot_${s}`] = limbDirection(rig.foot[s]);
  }
  return segments;
}

/**
 * Poses the model's limbs to match estimated photo landmarks. Every landmark is
 * used, occluded or not: the preview lets the user correct the uncertain ones.
 */
export function applyPoseToRig(
  bones: THREE.Bone[],
  landmarks: PoseLandmark[],
  camera: THREE.Camera
) {
  // Landmark y points down and z points away from the camera; segments use y up, z toward viewer.
  const dir = (from: number, to: number): Vec3 => [
    landmarks[to].x - landmarks[from].x,
    -(landmarks[to].y - landmarks[from].y),
    -(landmarks[to].z - landmarks[from].z),
  ];
  const mid = (a: number, b: number) => ({
    x: (landmarks[a].x + landmarks[b].x) / 2,
    y: (landmarks[a].y + landmarks[b].y) / 2,
    z: (landmarks[a].z + landmarks[b].z) / 2,
  });
  const hips = mid(LM.hip.l, LM.hip.r);
  const shoulders = mid(LM.shoulder.l, LM.shoulder.r);

  const segments: PoseSegments = {
    across: dir(LM.hip.r, LM.hip.l),
    torso_up: [shoulders.x - hips.x, -(shoulders.y - hips.y), -(shoulders.z - hips.z)],
  };
  for (const s of SIDES) {
    segments[`thigh_${s}`] = dir(LM.hip[s], LM.knee[s]);
    segments[`shin_${s}`] = dir(LM.knee[s], LM.ankle[s]);
    segments[`foot_${s}`] = dir(LM.ankle[s], LM.toe[s]);
    segments[`upper_arm_${s}`] = dir(LM.shoulder[s], LM.elbow[s]);
    segments[`forearm_${s}`] = dir(LM.elbow[s], LM.wrist[s]);
  }
  applySegmentsToRig(bones, segments, camera);
}
