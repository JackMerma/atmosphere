import * as THREE from "three";
import { collectBones } from "@/lib/boneMath";
import { settlePose } from "@/lib/settle";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

/** Local rotation (x, y, z, w) of every bone, in `collectBones` order. */
export type PoseQuats = number[][];

export const sceneOf = (side: Side) => {
  const { scene, finalScene } = useAtmosphereStore.getState();
  return side === "initial" ? scene : finalScene;
};

export const bonesOf = (side: Side) => {
  const scene = sceneOf(side);
  return scene ? collectBones(scene) : [];
};

export function snapshotPose(bones: THREE.Bone[]): PoseQuats {
  return bones.map((b) => b.quaternion.toArray());
}

/** Writes a snapshot onto the bones and settles it into a body that can exist. */
export function restorePose(bones: THREE.Bone[], quats: PoseQuats) {
  bones.forEach((b, i) => b.quaternion.fromArray(quats[i]));
  settlePose(bones);
}

export const restQuats = (bones: THREE.Bone[]): PoseQuats =>
  bones.map((b) => (b.userData.restQuaternion as number[]) ?? b.quaternion.toArray());

export function resetToRest(bones: THREE.Bone[]) {
  restorePose(bones, restQuats(bones));
}

/** The pose saved for a side, or the model's rest pose if none was saved. */
export function slotQuats(side: Side, bones = bonesOf(side)): PoseQuats {
  const saved = useAtmosphereStore.getState().slots[side].quats;
  return saved && saved.length === bones.length ? saved : restQuats(bones);
}

/** Puts a side's model into its saved pose (rest when nothing was saved). */
export function applySlot(side: Side) {
  const bones = bonesOf(side);
  if (bones.length) restorePose(bones, slotQuats(side, bones));
}

const a = new THREE.Quaternion();
const b = new THREE.Quaternion();

/** Largest rotation difference between two poses of the same skeleton, in degrees. */
export function poseDistance(x: PoseQuats, y: PoseQuats) {
  let max = 0;
  for (let i = 0; i < x.length; i++) {
    max = Math.max(max, a.fromArray(x[i]).angleTo(b.fromArray(y[i])));
  }
  return THREE.MathUtils.radToDeg(max);
}
