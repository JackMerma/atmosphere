import * as THREE from "three";

/** Every bone in a model, in scene-traversal order (stable for a given file). */
export function collectBones(scene: THREE.Object3D) {
  const bones: THREE.Bone[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.Bone) bones.push(o);
  });
  return bones;
}

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
