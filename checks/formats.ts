import * as fsSync from "node:fs";
import * as pathMod from "node:path";
import { readFixture, shimBrowser, skip } from "./fixtures";
import * as THREE from "three";
import { openModel, parseModel } from "@/lib/modelLoader";
import { mapHumanoid } from "@/lib/humanoidRig";
import { buildJointLimits } from "@/lib/jointLimits";


const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};


async function inspect(label: string, fileName: string) {
  let source;
  try {
    source = openModel(readFixture(fileName), fileName);
  } catch (err) {
    check(label + ": opens", false, String(err));
    return;
  }
  check(
    label + ": opens",
    true,
    `kind=${source.kind} model="${source.name}" sidecars=${source.assets.size}`
  );

  let scene: THREE.Group;
  try {
    scene = await parseModel(source);
  } catch (err) {
    check(label + ": parses", false, String(err).slice(0, 160));
    return;
  }

  const bones: THREE.Bone[] = [];
  let meshes = 0;
  scene.traverse((o) => {
    if (o instanceof THREE.Bone) bones.push(o);
    if ((o as THREE.Mesh).isMesh) meshes++;
  });
  check(label + ": parses", true, `${bones.length} bones, ${meshes} meshes`);

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  check(
    label + ": normalised to the stage",
    Math.abs(size.y - 2.6) < 0.05 && Math.abs(box.min.y) < 0.05,
    `height ${size.y.toFixed(2)} feet at y=${box.min.y.toFixed(3)}`
  );

  if (bones.length >= 2) {
    bones.forEach((b) => (b.userData.restQuaternion = b.quaternion.toArray()));
    buildJointLimits(scene, bones);
    try {
      const rig = mapHumanoid(bones);
      const limited = bones.filter((b) => b.userData.jointLimit).length;
      check(
        label + ": humanoid recognised",
        limited >= 8,
        `hips="${rig.hips.name}" limbs with limits=${limited}`
      );
    } catch (err) {
      check(label + ": humanoid recognised", false, String(err).slice(0, 120));
    }
  }
}

async function main() {
  shimBrowser();
  const dir = pathMod.join(process.cwd(), "checks", "fixtures");
  const models = fsSync.existsSync(dir)
    ? fsSync
        .readdirSync(dir)
        .filter((n) => /\.(glb|gltf|fbx|zip)$/i.test(n))
    : [];
  if (models.length === 0) {
    skip("format loading", [".glb", ".fbx", ".zip"]);
    process.exit(0);
  }
  for (const model of models) await inspect(model, model);
  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);

}
main();
