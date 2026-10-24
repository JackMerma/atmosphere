import * as THREE from "three";
import { setLimitStrength } from "@/lib/jointLimits";
import { resolveCollisions } from "@/lib/collision";
import { settlePose } from "@/lib/settle";
import { reachToward, setChainStrength } from "@/lib/ikChain";
import { setCollisionStrength } from "@/lib/collision";
import { buildRig } from "./rig";

const DEG = Math.PI / 180;

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

// 6. Chain strength at 0 moves only the joint attached to the handle: nothing
//    further up reacts at all.
{
  setChainStrength(0);
  resetAll();
  const hand = by("mixamorigLeftHand");
  reachToward(
    hand,
    at("mixamorigLeftHand").add(new THREE.Vector3(-0.25, 0.35, 0.1)),
    by("mixamorigHips")
  );
  root.updateMatrixWorld(true);
  const fore = turned("mixamorigLeftForeArm");
  const arm = turned("mixamorigLeftArm");
  check("Chain 0: the grabbed joint's own joint still moves", fore > 5, fore.toFixed(1) + "deg");
  check("Chain 0: nothing further up reacts", arm < 0.01, arm.toFixed(4) + "deg");
  setChainStrength(1);
}

// 7. Chain strength in between sits between 0 and the full-strength shoulder lean.
{
  const target = at("mixamorigLeftHand").add(new THREE.Vector3(-0.25, 0.35, 0.1));

  setChainStrength(1);
  resetAll();
  reachToward(by("mixamorigLeftHand"), target, by("mixamorigHips"));
  root.updateMatrixWorld(true);
  const full = turned("mixamorigLeftArm");

  setChainStrength(0.5);
  resetAll();
  reachToward(by("mixamorigLeftHand"), target, by("mixamorigHips"));
  root.updateMatrixWorld(true);
  const half = turned("mixamorigLeftArm");
  check(
    "Chain 50%: the shoulder lean sits between 0 and full strength",
    half > 0.01 && half < full,
    `0 < ${half.toFixed(2)}deg < ${full.toFixed(2)}deg`
  );
  setChainStrength(1);
}

// 8. Collision strength at 0 detects an overlap but leaves it uncorrected.
{
  setCollisionStrength(0);
  resetAll();
  for (const side of ["Left", "Right"] as const) {
    const sx = side === "Left" ? 1 : -1;
    by("mixamorig" + side + "Arm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * 95 * DEG);
    by("mixamorig" + side + "ForeArm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * 160 * DEG);
  }
  root.updateMatrixWorld(true);
  const hits = resolveCollisions(bones);
  check("Collision 0%: nothing is reported, nothing is corrected", hits === 0, hits + " hits reported");
  setCollisionStrength(1);
}

// 9. Collision strength at 50% corrects the overlap by less than full strength
//    does. The forearm's own rotation axis cannot absorb this particular push
//    (it runs along the bone), so it walks up to the shoulder instead -- the
//    same chain-climbing `collision.ts` documents -- which is the bone to
//    measure, not the forearm itself.
{
  const pose = () => {
    resetAll();
    for (const side of ["Left", "Right"] as const) {
      const sx = side === "Left" ? 1 : -1;
      by("mixamorig" + side + "Arm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * 95 * DEG);
      by("mixamorig" + side + "ForeArm").quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx * 160 * DEG);
    }
    root.updateMatrixWorld(true);
  };

  pose();
  const authored = turned("mixamorigLeftArm");

  setCollisionStrength(1);
  pose();
  resolveCollisions(bones);
  const full = authored - turned("mixamorigLeftArm");

  setCollisionStrength(0.5);
  pose();
  resolveCollisions(bones);
  const half = authored - turned("mixamorigLeftArm");

  check(
    "Collision 50%: the correction is between none and the full push",
    half > 0.01 && half < full,
    `0 < ${half.toFixed(2)}deg < ${full.toFixed(2)}deg of shoulder correction`
  );
  setCollisionStrength(1);
}

console.log(results.join("\n"));
console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
