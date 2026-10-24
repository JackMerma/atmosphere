import * as THREE from "three";
import { applyWorldRotation } from "@/lib/boneMath";
import { isAnchored } from "@/lib/anchor";

/** How many joints above the dragged one take part, and how fast their share decays. */
const DEPTH = 4;
const FALLOFF = 0.45;
/** Two sweeps are enough to look connected without the chain wobbling. */
const SWEEPS = 2;

const handleWorld = new THREE.Vector3();
const pivot = new THREE.Vector3();
const toHandle = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const delta = new THREE.Quaternion();

/**
 * Drags `handle` toward `target` by turning the joints above it, each one less
 * than the last: the nearest joint does most of the work, its parent helps a
 * little, and the effect fades out into the torso.
 *
 * This is what makes a pull on the wrist bend the elbow, swing the shoulder and
 * lean the chest, instead of snapping one bone in isolation. Every rotation
 * goes through `applyWorldRotation`, so the joint limits still apply.
 */
export function reachToward(handle: THREE.Bone, target: THREE.Vector3, anchor: THREE.Bone | null) {
  const chain: THREE.Bone[] = [];
  let bone = handle.parent;
  while (bone instanceof THREE.Bone && chain.length < DEPTH) {
    // The hips anchor the figure: turning them would swing the whole body.
    if (isAnchored(bone, anchor)) break;
    chain.push(bone);
    bone = bone.parent;
  }
  if (chain.length === 0) return;

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    // Nearest joint first, so the later, weaker ones correct what it left over.
    for (let i = 0; i < chain.length; i++) {
      const joint = chain[i];
      const share = Math.pow(FALLOFF, i);

      handle.getWorldPosition(handleWorld);
      joint.getWorldPosition(pivot);
      toHandle.subVectors(handleWorld, pivot);
      toTarget.subVectors(target, pivot);
      if (toHandle.lengthSq() < 1e-10 || toTarget.lengthSq() < 1e-10) continue;

      toHandle.normalize();
      toTarget.normalize();
      delta.setFromUnitVectors(toHandle, toTarget);
      // Only this joint's share of the correction, so the chain bends as a whole.
      delta.slerp(new THREE.Quaternion(), 1 - share);
      applyWorldRotation(joint, delta);
    }
  }
}
