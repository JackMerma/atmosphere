import * as fs from "node:fs";
import * as path from "node:path";
import * as THREE from "three";
import { findFixture, readFixture, shimBrowser } from "./fixtures";
import { parseModelPair } from "@/lib/gltfJoints";
import { applySegmentsToRig, measureSegments, type PoseSegments } from "@/lib/poseRetarget";
import {
  canonicalCamera,
  nearestPoses,
  segmentDistance,
  type LibraryPose,
} from "@/lib/poseLibrary";
import { setLimitStrength } from "@/lib/jointLimits";
import { setCollisionStrength } from "@/lib/collision";

const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};

/** A walk contact: left foot forward, right trailing, arms opposed to the legs. */
const contact: PoseSegments = {
  across: [1, 0, 0],
  torso_up: [0, 1, 0.05],
  head_up: [0, 1, 0],
  thigh_l: [0, -0.85, 0.55], shin_l: [0, -1, 0.1], foot_l: [0, -0.3, 0.95],
  thigh_r: [0, -0.9, -0.45], shin_r: [0, -0.85, -0.5], foot_r: [0, -0.5, 0.85],
  upper_arm_r: [0.1, -0.92, 0.4], forearm_r: [0.1, -0.95, 0.3],
  upper_arm_l: [-0.1, -0.92, -0.4], forearm_l: [-0.1, -0.95, -0.25],
};

/** Standing straight, facing the viewer. */
const standing: PoseSegments = {
  across: [1, 0, 0], torso_up: [0, 1, 0], head_up: [0, 1, 0],
  upper_arm_l: [0, -1, 0], forearm_l: [0, -1, 0],
  upper_arm_r: [0, -1, 0], forearm_r: [0, -1, 0],
  thigh_l: [0, -1, 0], shin_l: [0, -1, 0], foot_l: [0, 0, 1],
  thigh_r: [0, -1, 0], shin_r: [0, -1, 0], foot_r: [0, 0, 1],
};

const LIBRARY_FILE = "public/poseLibrary.json";

async function main() {
  shimBrowser();
  setLimitStrength(0.7);

  const file = path.join(process.cwd(), LIBRARY_FILE);
  if (!fs.existsSync(file)) {
    console.log(`SKIP  pose library — run \`npx tsx scripts/harvest.ts\` to build ${LIBRARY_FILE}.`);
    process.exit(0);
  }
  const library: LibraryPose[] = JSON.parse(fs.readFileSync(file, "utf8"));
  check("The library has poses in it", library.length > 0, library.length + " poses");
  if (library.length === 0) {
    console.log(results.join("\n"));
    process.exit(1);
  }

  // 1. The metric itself: a pose is zero from itself, and distance is symmetric.
  {
    const self = segmentDistance(library[0].segments, library[0].segments);
    const ab = segmentDistance(library[0].segments, library[1].segments);
    const ba = segmentDistance(library[1].segments, library[0].segments);
    check("A pose is zero degrees from itself", self === 0, self.toFixed(6) + "deg");
    check("Distance is symmetric", Math.abs(ab - ba) < 1e-9, `${ab.toFixed(4)} vs ${ba.toFixed(4)}`);
  }

  // 2. A library pose looked up against the library finds itself, exactly. This
  //    is what says the search is a search and not an accident of ordering.
  {
    const index = Math.floor(library.length / 2);
    const found = nearestPoses(library[index].segments, library, 1)[0];
    check(
      "A library pose finds itself first",
      found.pose.id === library[index].id && found.distance < 1e-9,
      `${found.distance.toFixed(6)}deg, id matches: ${found.pose.id === library[index].id}`
    );
  }

  // 3. The harvest deduplicates: no two entries are near-copies, or the library
  //    fills up with one held idle and crowds out the poses a search needs.
  {
    let closest = Infinity;
    for (let i = 0; i < library.length; i++) {
      for (let j = i + 1; j < library.length; j++) {
        closest = Math.min(closest, segmentDistance(library[i].segments, library[j].segments));
      }
    }
    check("No two poses are near-copies", closest >= 5, `closest pair ${closest.toFixed(1)}deg apart`);
  }

  // 4. The point of the whole thing: different targets must choose different
  //    poses. A library that answers everything with its average is no library.
  {
    const forWalk = nearestPoses(contact, library, 1)[0];
    const forStanding = nearestPoses(standing, library, 1)[0];
    check(
      "Different targets choose different poses",
      forWalk.pose.id !== forStanding.pose.id,
      `walk -> ${forWalk.distance.toFixed(1)}deg, standing -> ${forStanding.distance.toFixed(1)}deg`
    );
    check(
      "The nearest pose beats the furthest by a wide margin",
      nearestPoses(contact, library, library.length).at(-1)!.distance > forWalk.distance * 1.8,
      `${forWalk.distance.toFixed(1)}deg vs ${nearestPoses(contact, library, library.length).at(-1)!.distance.toFixed(1)}deg`
    );
  }

  // 5. Nearest-first ordering actually holds.
  {
    const top = nearestPoses(contact, library, 5);
    const ordered = top.every((m, i) => i === 0 || m.distance >= top[i - 1].distance);
    check("Matches come back nearest first", ordered, top.map((m) => m.distance.toFixed(1)).join(" <= "));
  }

  // 6. The claim the library rests on: a pose harvested from one skeleton
  //    applies to a DIFFERENT one and reads back as the same pose. Without this
  //    a library is just a recording of whichever model made it.
  {
    const model = findFixture(".glb", ".gltf", ".fbx");
    if (!model) {
      results.push("SKIP  Rig independence — needs a model in checks/fixtures/");
    } else {
      const { scene } = await parseModelPair(readFixture(model), model);
      const bones: THREE.Bone[] = [];
      scene.traverse((o) => {
        if (o instanceof THREE.Bone) bones.push(o);
      });
      const camera = canonicalCamera();

      /** Applies every pose in turn and reports how far it reads back. */
      const drift = () => {
        let worst = 0;
        let total = 0;
        let worstId = "";
        for (const pose of library) {
          applySegmentsToRig(bones, pose.segments, camera);
          const away = segmentDistance(pose.segments, measureSegments(bones, camera));
          total += away;
          if (away > worst) {
            worst = away;
            worstId = pose.id;
          }
        }
        return { worst, mean: total / library.length, worstId };
      };

      // The representation itself must be lossless: with the physics layer out
      // of the way, a pose written onto a different skeleton has to read back as
      // the same pose, or a library means nothing once it leaves its own model.
      // Every pose, not a sample -- sampling every tenth hid a 36deg case.
      setLimitStrength(0);
      setCollisionStrength(0);
      const bare = drift();
      check(
        "A library pose applies to another rig and reads back the same",
        bare.worst < 1,
        `worst ${bare.worst.toFixed(2)}deg, mean ${bare.mean.toFixed(2)}deg across all ${library.length}`
      );

      // With the physics on, poses legitimately change: they are being clamped
      // to what THIS body can do. Measured, not asserted tightly -- the number
      // is the point. It is high because collision is pushing apart poses a real
      // person actually held; see docs/status.md.
      setLimitStrength(0.7);
      setCollisionStrength(1);
      const settled = drift();
      check(
        "Physics changes a harvested pose, and the amount is recorded",
        settled.worst < 60,
        `worst ${settled.worst.toFixed(1)}deg, mean ${settled.mean.toFixed(1)}deg (${settled.worstId})`
      );
    }
  }

  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
}

main();
