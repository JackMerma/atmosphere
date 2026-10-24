import * as THREE from "three";
import { buildRig } from "./rig";
import { settlePose } from "@/lib/settle";
import { timelineFor } from "@/lib/timeline";
import { DEFAULT_MOTION, type MotionParams } from "@/lib/motionParams";
import type { Animation } from "@/lib/animations";

const DEG = Math.PI / 180;

const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};

const { root, bones, by } = buildRig();
const rest = bones.map((b) => b.quaternion.toArray());
const name = (b: THREE.Bone) => bones.indexOf(b);

const ARM = name(by("mixamorigLeftArm"));
const HAND = name(by("mixamorigLeftHand"));
const FORE = name(by("mixamorigLeftForeArm"));
const THIGH = name(by("mixamorigLeftUpLeg"));

/** A pose built by turning a few joints, settled, and read back. */
function pose(turns: [THREE.Bone, THREE.Vector3, number][]) {
  bones.forEach((b, i) => b.quaternion.fromArray(rest[i]));
  for (const [bone, axis, degrees] of turns) {
    bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, degrees * DEG));
  }
  settlePose(bones);
  return bones.map((b) => b.quaternion.toArray());
}

const X = new THREE.Vector3(1, 0, 0);

/** A four-pose cycle: the left limbs swing forward, then back. */
const animation: Animation = {
  id: "check",
  index: 1,
  label: "check",
  createdAt: 0,
  duration: 1.2,
  loop: true,
  keyframes: [
    [0, pose([])],
    [0.3, pose([[by("mixamorigLeftArm"), X, 40], [by("mixamorigLeftForeArm"), X, 35], [by("mixamorigLeftUpLeg"), X, 25]])],
    [0.6, pose([[by("mixamorigLeftArm"), X, -30], [by("mixamorigLeftForeArm"), X, -25], [by("mixamorigLeftUpLeg"), X, -20]])],
    [0.9, pose([[by("mixamorigLeftArm"), X, 10]])],
  ].map(([time, quats]) => ({
    pose: "beat",
    match: null,
    converged: true,
    grounded: true,
    ease: "inOut" as const,
    time: time as number,
    quats: quats as number[][],
  })),
};

const params = (over: Partial<MotionParams>): MotionParams => ({ ...DEFAULT_MOTION, ...over });

/** Puts the rig through the animation at `time` and reads one bone back. */
function at(p: Partial<MotionParams>, time: number, bone: number) {
  bones.forEach((b, i) => b.quaternion.fromArray(rest[i]));
  root.position.set(0, 0, 0);
  timelineFor(animation, root, bones, params(p)).pose(time);
  return bones[bone].quaternion.toArray();
}

const same = (a: number[], b: number[]) => a.every((n, i) => Math.abs(n - b[i]) < 1e-6);
const apart = (a: number[], b: number[]) =>
  new THREE.Quaternion().fromArray(a).angleTo(new THREE.Quaternion().fromArray(b)) / DEG;

// 1. With no drag, the timeline lands exactly on the poses it was given.
{
  const flat = { lag: 0 };
  const onFirst = animation.keyframes.map((_, k) =>
    same(at(flat, animation.keyframes[k].time!, ARM), animation.keyframes[k].quats[ARM])
  );
  check(
    "Every keyframe is reached exactly",
    onFirst.every(Boolean),
    onFirst.filter(Boolean).length + "/" + onFirst.length + " poses hit bit-for-bit"
  );
}

// 2. Amplitude carries a pose further from rest, and keeps going past 1.
{
  const reach = (amplitude: number) => apart(at({ lag: 0, amplitude }, 0.3, ARM), rest[ARM]);
  const low = reach(0.6);
  const mid = reach(1);
  const high = reach(1.5);
  check(
    "Amplitude is monotone",
    low < mid - 1 && mid < high - 1,
    `0.6 -> ${low.toFixed(1)}deg, 1.0 -> ${mid.toFixed(1)}deg, 1.5 -> ${high.toFixed(1)}deg`
  );
  check("Amplitude 1 is the authored pose", Math.abs(mid - 40) < 1.5, mid.toFixed(1) + "deg (authored 40)");
}

// 3. The arm dial moves the arms and leaves the legs where they were.
{
  const swung = at({ lag: 0, armAmplitude: 1.8 }, 0.3, ARM);
  const plain = at({ lag: 0 }, 0.3, ARM);
  const legSwung = at({ lag: 0, armAmplitude: 1.8 }, 0.3, THIGH);
  const legPlain = at({ lag: 0 }, 0.3, THIGH);
  check("The arm dial swings the arm wider", apart(swung, plain) > 10, apart(swung, plain).toFixed(1) + "deg wider");
  check("The arm dial leaves the legs alone", same(legSwung, legPlain), "leg unchanged bit-for-bit");
}

// 4. Drag makes a deep joint read the timeline behind the body: the forearm at
//    time t is exactly where the undragged forearm was its own depth earlier.
{
  const lag = 0.02;
  const depth = 5; // arm, shoulder, chest, spine, hips
  const dragged = at({ lag }, 0.3, FORE);
  const earlier = at({ lag: 0 }, 0.3 - depth * lag, FORE);
  const now = at({ lag: 0 }, 0.3, FORE);
  check("Drag delays a deep joint", apart(dragged, now) > 1, apart(dragged, now).toFixed(1) + "deg behind");
  check(
    "The delay is exactly the chain depth",
    apart(dragged, earlier) < 0.5,
    apart(dragged, earlier).toFixed(2) + "deg from t-" + (depth * lag).toFixed(2) + "s"
  );
}

// 5. Arm phase slides the arms around the cycle, by exactly the fraction asked.
{
  const cycle = timelineFor(animation, root, bones, DEFAULT_MOTION).cycle;
  const shift = 0.25;
  const phased = at({ lag: 0, armPhase: shift }, 0.3, ARM);
  const back = at({ lag: 0 }, 0.3 - shift * cycle, ARM);
  const legPhased = at({ lag: 0, armPhase: shift }, 0.3, THIGH);
  const legPlain = at({ lag: 0 }, 0.3, THIGH);
  check(
    "Arm phase shifts the arms by that fraction of the cycle",
    apart(phased, back) < 0.5,
    apart(phased, back).toFixed(2) + "deg from the unphased arm " + (shift * cycle).toFixed(2) + "s earlier"
  );
  check("Arm phase leaves the legs in place", same(legPhased, legPlain), "leg unchanged bit-for-bit");
}

// 6. Spacing changes how the time between two poses is spent, not the poses.
{
  const ends = (spacing: number) =>
    same(at({ lag: 0, spacing }, 0, ARM), animation.keyframes[0].quats[ARM]) &&
    same(at({ lag: 0, spacing }, 0.3, ARM), animation.keyframes[1].quats[ARM]);
  check("Spacing leaves the keyframes untouched", ends(0.6) && ends(1.6), "both ends hit at 0.6 and 1.6");

  const travelled = (spacing: number) => apart(at({ lag: 0, spacing }, 0.15, ARM), rest[ARM]);
  const early = travelled(0.6);
  const even = travelled(1);
  const late = travelled(1.6);
  check(
    "Spacing is monotone mid-segment",
    early > even + 1 && even > late + 1,
    `0.6 -> ${early.toFixed(1)}deg, 1.0 -> ${even.toFixed(1)}deg, 1.6 -> ${late.toFixed(1)}deg of the way`
  );
}

// 7. The bob dial at 0 is the old floating behaviour: nothing touches height.
{
  bones.forEach((b, i) => b.quaternion.fromArray(rest[i]));
  root.position.set(0, 0, 0);
  timelineFor(animation, root, bones, params({ bob: 0 })).pose(0.3);
  check("Bob 0 leaves the figure where it was", root.position.y === 0, "y=" + root.position.y);
}

console.log(results.join("\n"));
console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
