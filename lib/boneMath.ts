import * as THREE from "three";

const boneWorldQuat = new THREE.Quaternion();
const newWorldQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();

/** Rotates a bone by a world-space delta, converting it to the bone's local quaternion. */
export function applyWorldRotation(bone: THREE.Bone, delta: THREE.Quaternion) {
  bone.getWorldQuaternion(boneWorldQuat);
  newWorldQuat.multiplyQuaternions(delta, boneWorldQuat);

  if (bone.parent) {
    bone.parent.getWorldQuaternion(parentWorldQuat).invert();
    bone.quaternion.multiplyQuaternions(parentWorldQuat, newWorldQuat);
  } else {
    bone.quaternion.copy(newWorldQuat);
  }
  bone.updateMatrixWorld(true);
}
