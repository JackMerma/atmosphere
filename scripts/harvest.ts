import * as fs from "node:fs";
import * as path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { shimBrowser } from "../checks/fixtures";
import { mapHumanoid } from "@/lib/humanoidRig";
import { measureSegments } from "@/lib/poseRetarget";
import { settlePose } from "@/lib/settle";
import { buildJointLimits, setLimitStrength } from "@/lib/jointLimits";
import { canonicalCamera, segmentDistance, type LibraryPose } from "@/lib/poseLibrary";

/**
 * Builds the pose vocabulary the app chooses from, out of animation files.
 *
 * A Mixamo download is a sequence of poses: this walks each clip, reads the
 * skeleton at intervals, and writes every distinct pose it finds as segment
 * directions. Nothing of the model survives into the library -- no mesh, no
 * texture, no bone names -- only direction numbers, which is what lets a pose
 * harvested from one skeleton apply to any humanoid the user uploads.
 *
 *   npx tsx scripts/harvest.ts [sourceDir] [outFile]
 *
 * Source files are read from `poses/` if it exists, otherwise from
 * `checks/fixtures/`, which already holds Mixamo clips.
 */

/** How often a clip is read, in seconds. Fine enough to catch a footfall. */
const SAMPLE_STEP = 0.08;
/**
 * A sample is kept only if it is at least this far, in degrees, from every pose
 * already kept. Animations hold still for long stretches, and a library of two
 * hundred copies of the same idle is worse than useless -- it crowds out the
 * poses a search actually needs.
 */
const MIN_SEPARATION = 7;

const ROOT = process.cwd();
const sourceDir = process.argv[2] ?? (fs.existsSync(path.join(ROOT, "poses")) ? "poses" : "checks/fixtures");
const outFile = process.argv[3] ?? "public/poseLibrary.json";

type Animated = THREE.Object3D & { animations: THREE.AnimationClip[] };

async function loadFile(file: string): Promise<Animated> {
  const buffer = fs.readFileSync(path.join(ROOT, sourceDir, file));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  if (file.toLowerCase().endsWith(".fbx")) {
    return new FBXLoader().parse(data, "") as Animated;
  }
  // GLTFLoader only reports through callbacks, even when parsing a buffer already in hand.
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => new GLTFLoader().parse(data, "", resolve as never, reject)
  );
  const scene = gltf.scene as Animated;
  scene.animations = gltf.animations;
  return scene;
}

async function harvestFile(file: string): Promise<LibraryPose[]> {
  const object = await loadFile(file);
  const clips = object.animations ?? [];
  if (clips.length === 0) {
    console.log(`  ${file}: no animation clips, skipped`);
    return [];
  }

  const bones: THREE.Bone[] = [];
  object.traverse((o) => {
    if (o instanceof THREE.Bone) bones.push(o);
  });
  if (bones.length === 0) {
    console.log(`  ${file}: no skeleton, skipped`);
    return [];
  }
  for (const bone of bones) bone.userData.restQuaternion = bone.quaternion.toArray();

  try {
    mapHumanoid(bones);
  } catch {
    console.log(`  ${file}: not a humanoid rig, skipped`);
    return [];
  }
  object.updateMatrixWorld(true);
  buildJointLimits(object, bones);

  const camera = canonicalCamera();
  const mixer = new THREE.AnimationMixer(object);
  const kept: LibraryPose[] = [];

  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    action.play();
    let keptHere = 0;

    for (let time = 0; time <= clip.duration; time += SAMPLE_STEP) {
      mixer.setTime(time);
      object.updateMatrixWorld(true);
      // Everything that writes a pose goes through settlePose, including this:
      // a clip frame can still be a body the app would refuse to produce.
      settlePose(bones);

      let segments;
      try {
        segments = measureSegments(bones, camera);
      } catch {
        continue;
      }
      if (kept.some((pose) => segmentDistance(pose.segments, segments) < MIN_SEPARATION)) continue;

      kept.push({
        id: `${file}:${clip.name}:${time.toFixed(2)}`,
        label: file.replace(/\.[^.]+$/, ""),
        source: `${file} · ${clip.name}`,
        time: Number(time.toFixed(2)),
        segments,
      });
      keptHere++;
    }
    action.stop();
    console.log(
      `  ${file} · "${clip.name}" (${clip.duration.toFixed(1)}s): kept ${keptHere} poses`
    );
  }
  return kept;
}

async function main() {
  shimBrowser();
  setLimitStrength(1);

  const dir = path.join(ROOT, sourceDir);
  if (!fs.existsSync(dir)) {
    console.error(`No such directory: ${sourceDir}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(fbx|glb|gltf)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`No .fbx/.glb/.gltf files in ${sourceDir}/`);
    process.exit(1);
  }
  console.log(`Harvesting ${files.length} file(s) from ${sourceDir}/`);

  const library: LibraryPose[] = [];
  for (const file of files) {
    for (const pose of await harvestFile(file)) {
      // Separation holds across the whole library, not just within one clip:
      // two files of the same walk should not both fill it with contacts.
      if (library.some((kept) => segmentDistance(kept.segments, pose.segments) < MIN_SEPARATION)) {
        continue;
      }
      library.push(pose);
    }
  }

  const out = path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(library));
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`\n${library.length} poses -> ${outFile} (${kb}KB)`);
}

main();
