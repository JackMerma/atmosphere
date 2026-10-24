import * as THREE from "three";
import { isRootBone } from "@/lib/boneMath";
import { mapHumanoid } from "@/lib/humanoidRig";

const anchors = new WeakMap<THREE.Bone, THREE.Bone | null>();

/**
 * The bone the body hangs from: the hips of a humanoid, else the skeleton root.
 *
 * Nothing automatic may rotate it. Coupling a drag up the chain, or shoving two
 * limbs apart, must stop below it -- turning the hips swings the entire figure,
 * which reads as the model flipping over rather than a limb reacting.
 */
export function anchorFor(bones: THREE.Bone[]): THREE.Bone | null {
  if (bones.length === 0) return null;
  const root = bones[0];
  if (!anchors.has(root)) {
    let anchor: THREE.Bone | null = null;
    try {
      anchor = mapHumanoid(bones).hips;
    } catch {
      anchor = bones.find((b) => isRootBone(b)) ?? root;
    }
    anchors.set(root, anchor);
  }
  return anchors.get(root) ?? null;
}

/** True when this bone, or one above it, is the anchor the body hangs from. */
export function isAnchored(bone: THREE.Bone, anchor: THREE.Bone | null) {
  return isRootBone(bone) || bone === anchor;
}
