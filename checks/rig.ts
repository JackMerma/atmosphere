import * as THREE from "three";
import { buildJointLimits } from "@/lib/jointLimits";

/**
 * A minimal Mixamo-named humanoid in a T-pose, built from scratch, with a spine
 * between the hips and the shoulders so a chain has somewhere to decay.
 *
 * Shared by the checks that need a skeleton but not a real model: it keeps them
 * independent of whatever file happens to be in `checks/fixtures/`.
 */
export function buildRig() {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "mixamorigHips";
  hips.position.set(0, 1, 0);
  root.add(hips);

  const bones: THREE.Bone[] = [hips];
  const add = (parent: THREE.Bone, name: string, offset: THREE.Vector3) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.copy(offset);
    parent.add(bone);
    bones.push(bone);
    return bone;
  };

  const spine = add(hips, "mixamorigSpine", new THREE.Vector3(0, 0.25, 0));
  const chest = add(spine, "mixamorigSpine2", new THREE.Vector3(0, 0.25, 0));
  for (const side of ["Left", "Right"] as const) {
    const sx = side === "Left" ? 1 : -1; // the character's own left is +x
    const shoulder = add(chest, "mixamorig" + side + "Shoulder", new THREE.Vector3(sx * 0.1, 0.05, 0));
    const arm = add(shoulder, "mixamorig" + side + "Arm", new THREE.Vector3(sx * 0.1, 0, 0));
    const fore = add(arm, "mixamorig" + side + "ForeArm", new THREE.Vector3(sx * 0.3, 0, 0));
    add(fore, "mixamorig" + side + "Hand", new THREE.Vector3(sx * 0.3, 0, 0));
    const upLeg = add(hips, "mixamorig" + side + "UpLeg", new THREE.Vector3(sx * 0.1, 0, 0));
    const leg = add(upLeg, "mixamorig" + side + "Leg", new THREE.Vector3(0, -0.45, 0));
    const foot = add(leg, "mixamorig" + side + "Foot", new THREE.Vector3(0, -0.45, 0));
    add(foot, "mixamorig" + side + "ToeBase", new THREE.Vector3(0, -0.05, 0.15));
  }
  const neck = add(chest, "mixamorigNeck", new THREE.Vector3(0, 0.25, 0));
  add(neck, "mixamorigHead", new THREE.Vector3(0, 0.12, 0));

  for (const b of bones) b.userData.restQuaternion = b.quaternion.toArray();
  root.updateMatrixWorld(true);
  buildJointLimits(root, bones);
  return { root, bones, by: (n: string) => bones.find((b) => b.name === n)! };
}
