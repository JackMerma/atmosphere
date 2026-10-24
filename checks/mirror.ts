import * as THREE from "three";
import { mirrorSegments, type PoseSegments, type Vec3 } from "@/lib/poseRetarget";

const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};

const show = (v: Vec3 | undefined) =>
  v ? `[${v.map((n) => n.toFixed(2)).join(",")}]` : "none";
const same = (a: Vec3 | undefined, b: Vec3 | undefined) =>
  !!a && !!b && a.every((n, i) => Math.abs(n - b[i]) < 1e-9);

/** Standing straight, facing the viewer. */
const standing: PoseSegments = {
  across: [1, 0, 0],
  torso_up: [0, 1, 0],
  head_up: [0, 1, 0],
  upper_arm_l: [0, -1, 0],
  forearm_l: [0, -1, 0],
  upper_arm_r: [0, -1, 0],
  forearm_r: [0, -1, 0],
  thigh_l: [0, -1, 0],
  shin_l: [0, -1, 0],
  foot_l: [0, 0, 1],
  thigh_r: [0, -1, 0],
  shin_r: [0, -1, 0],
  foot_r: [0, 0, 1],
};

/** A walk contact: left foot forward (+z), right foot trailing (-z), arms opposed. */
const contact: PoseSegments = {
  across: [1, 0, 0],
  torso_up: [0, 1, 0.05],
  head_up: [0, 1, 0],
  thigh_l: [0, -0.85, 0.55],
  shin_l: [0, -1, 0.1],
  foot_l: [0, -0.3, 0.95],
  thigh_r: [0, -0.9, -0.45],
  shin_r: [0, -0.85, -0.5],
  foot_r: [0, -0.5, 0.85],
  upper_arm_r: [0.1, -0.92, 0.4],
  forearm_r: [0.1, -0.95, 0.3],
  upper_arm_l: [-0.1, -0.92, -0.4],
  forearm_l: [-0.1, -0.95, -0.25],
};

// 1. A symmetric pose is its own mirror.
{
  const m = mirrorSegments(standing);
  const unchanged = (["upper_arm_l", "thigh_l", "foot_r", "torso_up", "head_up", "across"] as const).every(
    (k) => same(m[k] as Vec3, standing[k] as Vec3)
  );
  check("Standing mirrors to itself", unchanged, "across " + show(m.across) + " thighL " + show(m.thigh_l));
}

// 2. The walk contact mirrors into the opposite contact: the legs swap sides.
{
  const m = mirrorSegments(contact);
  const legsSwapped =
    same(m.thigh_l as Vec3, [-0, -0.9, -0.45]) && same(m.thigh_r as Vec3, [-0, -0.85, 0.55]);
  check(
    "Legs swap front for back",
    (m.thigh_l as Vec3)[2] < 0 && (m.thigh_r as Vec3)[2] > 0,
    "thighL " + show(m.thigh_l) + " thighR " + show(m.thigh_r)
  );
  check("Leg depths are exactly exchanged", legsSwapped, "exact swap with x negated");
}

// 3. The arms swap too, and stay opposed to the legs.
{
  const m = mirrorSegments(contact);
  const armL = m.upper_arm_l as Vec3;
  const armR = m.upper_arm_r as Vec3;
  check(
    "Arms swap with the legs",
    armL[2] > 0 && armR[2] < 0,
    "armL " + show(armL) + " armR " + show(armR)
  );
  check(
    "Arm stays opposite its own leg",
    armL[2] * (m.thigh_l as Vec3)[2] < 0,
    "armL z " + armL[2].toFixed(2) + " vs thighL z " + (m.thigh_l as Vec3)[2].toFixed(2)
  );
  check("Sideways lean is reflected", Math.abs(armL[0] + 0.1) < 1e-9, "armL x " + armL[0].toFixed(2));
}

// 4. Mirroring twice returns the original pose.
{
  const twice = mirrorSegments(mirrorSegments(contact));
  const keys = Object.keys(contact) as (keyof PoseSegments)[];
  const worst = Math.max(
    ...keys.map((k) => {
      const a = contact[k] as Vec3;
      const b = twice[k] as Vec3 | undefined;
      return b ? Math.max(...a.map((n, i) => Math.abs(n - b[i]))) : 1;
    })
  );
  check("Mirroring twice is the identity", worst < 1e-9, "worst drift " + worst.toExponential(1));
}

// 5. The body still faces the same way: chest direction is across x torso_up.
{
  const chest = (p: PoseSegments) =>
    new THREE.Vector3(...p.across).cross(new THREE.Vector3(...p.torso_up)).normalize();
  const before = chest(contact);
  const after = chest(mirrorSegments(contact));
  check(
    "The figure keeps facing the viewer",
    before.dot(after) > 0.99,
    "chest z " + before.z.toFixed(2) + " -> " + after.z.toFixed(2)
  );
}

console.log(results.join("\n"));
console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
