import { findFixture, readFixture, shimBrowser, skip } from "./fixtures";
import * as THREE from "three";
import { parseModelPair } from "@/lib/gltfJoints";
import { groundModel } from "@/lib/grounding";
import { mapHumanoid } from "@/lib/humanoidRig";
import { setLimitStrength } from "@/lib/jointLimits";


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

  // The stage group the model normally hangs under.
  const stage = new THREE.Group();
  stage.add(scene);
  stage.updateMatrixWorld(true);

  const hipsY = () => {
    stage.updateMatrixWorld(true);
    return rig.hips.getWorldPosition(new THREE.Vector3()).y;
  };
  /**
   * Height of the lowest foot. Measured from the bones, not from a bounding
   * box: Box3 reads a skinned mesh's bind pose, so it never sees the pose at all.
   */
  const feetY = () => {
    stage.updateMatrixWorld(true);
    const ankles = (["l", "r"] as const)
      .flatMap((side) => [rig.foot[side]?.bone, rig.foot[side]?.child])
      .filter((b): b is THREE.Bone => !!b);
    return Math.min(...ankles.map((b) => b.getWorldPosition(new THREE.Vector3()).y));
  };
  /**
   * A real crouch: the thigh tips back, the knee folds twice as far, and the
   * ankle takes up the difference so the foot stays flat on the floor.
   */
  const crouch = (degrees: number) => {
    const spin = (bone: THREE.Bone, turn: number) =>
      bone.quaternion
        .fromArray(bone.userData.restQuaternion)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            THREE.MathUtils.degToRad(turn)
          )
        );
    for (const side of ["l", "r"] as const) {
      if (rig.thigh[side]) spin(rig.thigh[side]!.bone, -degrees);
      if (rig.calf[side]) spin(rig.calf[side]!.bone, 2 * degrees);
      if (rig.foot[side]) spin(rig.foot[side]!.bone, -degrees);
    }
    stage.updateMatrixWorld(true);
  };

  check(label + ": grounding works on this rig", groundModel(scene, bones), "feet found");

  const standingFeet = feetY();
  const standingHips = hipsY();

  crouch(45);
  groundModel(scene, bones);
  const crouchFeet = feetY();
  const crouchHips = hipsY();

  check(label + ": the feet stay on the floor through the crouch",
    Math.abs(crouchFeet - standingFeet) < 0.03,
    "lowest foot " + standingFeet.toFixed(3) + " -> " + crouchFeet.toFixed(3));
  check(label + ": the hips DROP into the crouch", crouchHips < standingHips - 0.05,
    "hips " + standingHips.toFixed(2) + " -> " + crouchHips.toFixed(2));

  crouch(0);
  groundModel(scene, bones);
  const backUp = hipsY();
  check(label + ": straightening lifts the body again", Math.abs(backUp - standingHips) < 0.02,
    "hips back to " + backUp.toFixed(2));

  // A deeper crouch must drop further than a shallow one: weight, not a switch.
  crouch(25);
  groundModel(scene, bones);
  const shallow = hipsY();
  crouch(70);
  groundModel(scene, bones);
  const deep = hipsY();
  check(label + ": a deeper crouch drops further", deep < shallow && shallow < standingHips,
    `${standingHips.toFixed(2)} > ${shallow.toFixed(2)} > ${deep.toFixed(2)}`);
}

async function main() {
  shimBrowser();
  const model = findFixture(".glb", ".gltf", ".fbx", ".zip");
  if (!model) {
    skip("grounding", [".glb", ".fbx", ".zip"]);
    process.exit(0);
  }
  await run(model, model);
  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
}
main();
