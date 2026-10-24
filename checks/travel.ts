import { findFixture, readFixture, shimBrowser, skip } from "./fixtures";
import * as THREE from "three";
import { parseModelPair } from "@/lib/gltfJoints";
import { mapHumanoid } from "@/lib/humanoidRig";
import { setLimitStrength } from "@/lib/jointLimits";
import { settlePose } from "@/lib/settle";
import { registerGround, supportFoot } from "@/lib/planting";
import { timelineFor, type Motion } from "@/lib/timeline";
import { DEFAULT_MOTION } from "@/lib/motionParams";
import type { Keyframe } from "@/lib/animations";

const DEG = Math.PI / 180;

const results: string[] = [];
let failures = 0;
const check = (l: string, ok: boolean, d: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + l + "  " + d);
  if (!ok) failures++;
};

async function run(label: string, file: string) {
  setLimitStrength(0.7);
  const { scene } = await parseModelPair(readFixture(file), file);
  const bones: THREE.Bone[] = [];
  scene.traverse((o) => { if (o instanceof THREE.Bone) bones.push(o); });
  const rig = mapHumanoid(bones);

  // The stage group the model normally hangs under, and the ground travel is
  // put into, exactly as the viewport wires them up.
  const stage = new THREE.Group();
  stage.add(scene);
  const ground = new THREE.Object3D();
  registerGround(ground);
  stage.updateMatrixWorld(true);

  const spin = (bone: THREE.Bone, turn: number) =>
    bone.quaternion
      .fromArray(bone.userData.restQuaternion)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), turn * DEG)
      );

  /** A walk contact: `lead` reaches forward, the other trails, knees bent to suit. */
  function contact(lead: "l" | "r") {
    for (const bone of bones) bone.quaternion.fromArray(bone.userData.restQuaternion);
    const trail = lead === "l" ? "r" : "l";
    if (rig.thigh[lead]) spin(rig.thigh[lead]!.bone, -28);
    if (rig.calf[lead]) spin(rig.calf[lead]!.bone, 10);
    if (rig.thigh[trail]) spin(rig.thigh[trail]!.bone, 22);
    if (rig.calf[trail]) spin(rig.calf[trail]!.bone, 24);
    settlePose(bones);
    return bones.map((b) => b.quaternion.toArray());
  }

  const beat = (quats: number[][], time: number, grounded: boolean): Keyframe => ({
    pose: "beat",
    match: null,
    converged: true,
    grounded,
    ease: "inOut",
    time,
    quats,
  });

  const left = contact("l");
  const right = contact("r");
  const standing = (() => {
    for (const bone of bones) bone.quaternion.fromArray(bone.userData.restQuaternion);
    settlePose(bones);
    return bones.map((b) => b.quaternion.toArray());
  })();

  const walk: Motion = {
    duration: 1,
    loop: true,
    keyframes: [beat(left, 0, true), beat(right, 0.5, true)],
  };

  // 1. The whole point: while one foot has the weight, it does not move across
  //    the ground. Measured as the contact point in the GROUND's own frame.
  {
    const timeline = timelineFor(walk, scene, bones, DEFAULT_MOTION);
    let side: "l" | "r" | undefined;
    let anchor: THREE.Vector3 | null = null;
    let worst = 0;
    let stances = 0;
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      timeline.pose((i * timeline.cycle) / steps);
      stage.updateMatrixWorld(true);
      const support = supportFoot(scene, bones, side);
      if (!support) { side = undefined; anchor = null; continue; }
      const relative = support.contact.clone().sub(ground.position);
      if (support.side === side && anchor) {
        worst = Math.max(worst, Math.hypot(relative.x - anchor.x, relative.z - anchor.z));
      } else {
        side = support.side;
        anchor = relative;
        stances++;
      }
    }
    check(label + ": the planted foot does not slide across the ground",
      worst < 0.02 && stances >= 2,
      `worst slip ${worst.toFixed(4)} over ${stances} stances`);
  }

  // 2. A walk travels: the ground ends up a stride away, along one axis.
  {
    const { stride } = timelineFor(walk, scene, bones, DEFAULT_MOTION);
    const forward = Math.abs(stride.z);
    const sideways = Math.abs(stride.x);
    check(label + ": a walk travels", forward > 0.1,
      `stride ${forward.toFixed(3)} forward, ${sideways.toFixed(3)} sideways`);
    check(label + ": it travels along one axis", forward > sideways * 2,
      `forward is ${(forward / Math.max(sideways, 1e-6)).toFixed(1)}x sideways`);
  }

  // 3. Standing still goes nowhere, however long it is played.
  {
    const still: Motion = {
      duration: 1,
      loop: true,
      keyframes: [beat(standing, 0, true), beat(standing, 0.5, true)],
    };
    const { stride } = timelineFor(still, scene, bones, DEFAULT_MOTION);
    check(label + ": standing still does not travel", stride.length() < 0.01,
      "stride " + stride.length().toFixed(4));
  }

  // 4. In the air there is no planted foot, so nothing moves the ground.
  {
    const airborne: Motion = {
      duration: 1,
      loop: true,
      keyframes: [beat(left, 0, false), beat(right, 0.5, false)],
    };
    const { stride } = timelineFor(airborne, scene, bones, DEFAULT_MOTION);
    check(label + ": an airborne motion does not travel", stride.length() < 1e-6,
      "stride " + stride.length().toFixed(6));
  }

  // 5. Repeats carry on rather than snapping the ground back at the seam.
  {
    const timeline = timelineFor(walk, scene, bones, DEFAULT_MOTION);
    timeline.pose(timeline.cycle * 2);
    const twice = ground.position.clone();
    const expected = timeline.stride.clone().multiplyScalar(2);
    check(label + ": travel accumulates across repeats",
      twice.distanceTo(expected) < 1e-6,
      `after two laps z=${twice.z.toFixed(3)} vs stride*2 z=${expected.z.toFixed(3)}`);
  }

  registerGround(null);
}

async function main() {
  shimBrowser();
  const model = findFixture(".glb", ".gltf", ".fbx", ".zip");
  if (!model) {
    skip("travel", [".glb", ".fbx", ".zip"]);
    process.exit(0);
  }
  await run(model, model);
  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
}
main();
