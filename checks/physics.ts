import * as THREE from "three";
import { buildJointLimits, setLimitStrength } from "@/lib/jointLimits";
import { resolveCollisions } from "@/lib/collision";
import { settlePose } from "@/lib/settle";
import { reachToward } from "@/lib/ikChain";

const DEG = Math.PI / 180;

function buildRig() {
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
    const sx = side === "Left" ? 1 : -1;
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

const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};

const { root, bones, by } = buildRig();
const rest = bones.map((b) => b.quaternion.toArray());
const resetAll = () => {
  bones.forEach((b, i) => b.quaternion.fromArray(rest[i]));
  root.updateMatrixWorld(true);
};
const at = (name: string) => by(name).getWorldPosition(new THREE.Vector3());
/** Angle a bone has turned away from its rest rotation, in degrees. */
const turned = (name: string) => {
  const b = by(name);
  const r = new THREE.Quaternion().fromArray(b.userData.restQuaternion);
  return THREE.MathUtils.radToDeg(r.angleTo(b.quaternion));
};

setLimitStrength(0.7);

// 1. Arms swung across the chest get pushed off the torso.
{
  resetAll();
  // Fold both forearms hard inward so they end up inside the chest.
  for (const side of ["Left", "Right"] as const) {
    const sx = side === "Left" ? 1 : -1;
    const arm = by("mixamorig" + side + "Arm");
    arm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * 95 * DEG);
    const fore = by("mixamorig" + side + "ForeArm");
    fore.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * 160 * DEG);
  }
  root.updateMatrixWorld(true);
  const before = resolveCollisions(bones);
  resetAll();
  for (const side of ["Left", "Right"] as const) {
    const sx = side === "Left" ? 1 : -1;
    by("mixamorig" + side + "Arm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * 95 * DEG);
    by("mixamorig" + side + "ForeArm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * 160 * DEG);
  }
  root.updateMatrixWorld(true);
  settlePose(bones, 8);
  const after = resolveCollisions(bones);
  check("Arms inside the torso are detected", before > 0, before + " overlapping pairs");
  check("Settling clears them", after < before, before + " -> " + after + " overlaps");
}

// 2. A legal, open pose is left alone.
{
  resetAll();
  const hits = resolveCollisions(bones);
  check("T-pose has no overlaps", hits === 0, hits + " overlaps");

  const before = bones.map((b) => b.quaternion.clone());
  settlePose(bones, 4);
  const moved = Math.max(...bones.map((b, i) => b.quaternion.angleTo(before[i])));
  check("Settling leaves a legal pose alone", moved < 1e-6, "worst move " + moved.toFixed(8) + "rad");
}

// 3. Collisions hold even with the joint limits switched off.
{
  setLimitStrength(0);
  resetAll();
  for (const side of ["Left", "Right"] as const) {
    const sx = side === "Left" ? 1 : -1;
    by("mixamorig" + side + "Arm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * 95 * DEG);
    by("mixamorig" + side + "ForeArm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * 160 * DEG);
  }
  root.updateMatrixWorld(true);
  const before = resolveCollisions(bones);
  settlePose(bones, 8);
  const after = resolveCollisions(bones);
  check("Collisions still act at strength 0", before > 0 && after < before, before + " -> " + after);
  setLimitStrength(0.7);
}

// 4. Dragging the hand moves the chain, most at the elbow and least up the spine.
{
  resetAll();
  const hand = by("mixamorigLeftHand");
  const target = at("mixamorigLeftHand").add(new THREE.Vector3(-0.25, 0.35, 0.1));
  reachToward(hand, target, by("mixamorigHips"));
  root.updateMatrixWorld(true);

  const fore = turned("mixamorigLeftForeArm");
  const arm = turned("mixamorigLeftArm");
  const chest = turned("mixamorigSpine2");
  check("Forearm takes the pull", fore > 5, fore.toFixed(1) + "deg");
  check("Shoulder follows, less", arm > 0.5 && arm < fore, arm.toFixed(1) + "deg");
  check("Chest leans a little", chest > 0.05 && chest < arm, chest.toFixed(2) + "deg");

  const reached = at("mixamorigLeftHand").distanceTo(target);
  const started = 0.25 ** 2 + 0.35 ** 2 + 0.1 ** 2;
  check("Hand ends up nearer the cursor", reached < Math.sqrt(started), reached.toFixed(3) + " away");
}

// 5. The pull does not reach past the chain depth into the hips.
{
  resetAll();
  const hand = by("mixamorigLeftHand");
  reachToward(hand, at("mixamorigLeftHand").add(new THREE.Vector3(0, 0.4, 0)), by("mixamorigHips"));
  root.updateMatrixWorld(true);
  const hips = turned("mixamorigHips");
  check("Hips stay put", hips < 0.01, hips.toFixed(4) + "deg");
}

console.log(results.join("\n"));
console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
