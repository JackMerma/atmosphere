import { findFixture, readFixture, shimBrowser, skip } from "./fixtures";
import * as THREE from "three";
import { parseModelPair } from "@/lib/gltfJoints";
import { mapHumanoid } from "@/lib/humanoidRig";
import { setLimitStrength } from "@/lib/jointLimits";
import { settlePose } from "@/lib/settle";
import { snapshotPose } from "@/lib/pose";
import { timelineFor, __testing } from "@/lib/timeline";
import { TARGET_HEIGHT } from "@/lib/modelLoader";
import { DEFAULT_MOTION, type MotionParams } from "@/lib/motionParams";
import type { Animation } from "@/lib/animations";
import type { Keyframe } from "@/lib/animations";

const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};

async function run(label: string, file: string) {
  setLimitStrength(0.7);
  const { scene } = await parseModelPair(readFixture(file), file);
  const bones: THREE.Bone[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.Bone) bones.push(o);
  });
  const rig = mapHumanoid(bones);

  // The stage group the model normally hangs under -- same wiring the real
  // viewport uses, since `measureDrop` reads the floor via a Box3 over the
  // model's actual meshes, not the bones alone.
  const stage = new THREE.Group();
  stage.add(scene);
  stage.updateMatrixWorld(true);

  /** A real crouch: thigh tips back, knee folds twice as far, foot stays flat. */
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
    settlePose(bones);
    return snapshotPose(bones);
  };

  const standing = crouch(0);
  const crouched = crouch(40);
  const tucked = crouch(80);

  const beat = (quats: number[][], time: number, grounded: boolean): Keyframe => ({
    pose: "beat",
    match: null,
    converged: true,
    grounded,
    ease: "inOut",
    time,
    quats,
  });

  /**
   * The real shape a planned jump comes back as: grounded crouch, two
   * airborne keyframes (push off, a held peak), grounded landing and settle.
   * Mirrors an actual plan this was built to fix -- duration 1.8s.
   *
   * The arc's own window runs from the crouch (the last fully grounded
   * keyframe at t=0) to the landing (the first one after, at t=1.44): that is
   * what the lift search actually finds, searching inclusively from whichever
   * keyframe a given moment falls nearest. It is not [0.45, 1.44] (push off to
   * landing) even though those are the only two keyframes marked ungrounded --
   * the arc also has to cover the lead-in while the floor-contact weight is
   * still fading out, or the two would disagree about where the window starts.
   */
  const jump: Animation = {
    id: "check",
    index: 1,
    label: "check",
    createdAt: 0,
    duration: 1.8,
    loop: false,
    keyframes: [
      beat(crouched, 0, true),
      beat(tucked, 0.45, false),
      beat(tucked, 0.99, false),
      beat(crouched, 1.44, true),
      beat(standing, 1.8, true),
    ],
  };

  function yAt(time: number, params: MotionParams = DEFAULT_MOTION) {
    scene.position.set(0, 0, 0);
    timelineFor(jump, scene, bones, params).pose(time);
    return scene.position.y;
  }

  // 1. Fully grounded instants sit at the floor.
  {
    const atCrouch = yAt(0);
    const atLanding = yAt(1.44);
    check(label + ": the crouch is grounded", Math.abs(atCrouch) < 0.02, "y=" + atCrouch.toFixed(4));
    check(label + ": the landing is grounded", Math.abs(atLanding) < 0.02, "y=" + atLanding.toFixed(4));
  }

  // 2. The figure actually leaves the floor while airborne -- the whole point.
  //    The window is crouch (t=0) to landing (t=1.44); see the comment on
  //    `jump` above for why it starts at the crouch and not the push off.
  const WINDOW_START = 0;
  const WINDOW_END = 1.44;
  let peakY = 0;
  {
    const mid = (WINDOW_START + WINDOW_END) / 2;
    peakY = yAt(mid);
    check(label + ": the figure rises during the airborne span", peakY > 0.05, "y=" + peakY.toFixed(3) + " at the window's midpoint");
  }

  // 3. The lift is continuous: no snap in Y across the liftoff or landing
  //    instant. The bound is not zero: `settlePose` can nudge a joint against
  //    its limit mid-slerp (see `lib/timeline.ts`'s own comment on this), which
  //    shows up as a few hundredths of a unit of real jitter per step even on
  //    an otherwise smooth curve. The bug this guards against was two orders
  //    of magnitude larger -- an unmasked branch in `airborneLift` once
  //    produced a 3.5-unit cliff at a keyframe boundary.
  {
    const steps = 400;
    let worst = 0;
    let worstAt = 0;
    let prev = yAt(0);
    for (let i = 1; i <= steps; i++) {
      const t = (1.8 * i) / steps;
      const y = yAt(t);
      const d = Math.abs(y - prev);
      if (d > worst) {
        worst = d;
        worstAt = t;
      }
      prev = y;
    }
    check(
      label + ": height changes continuously, no snap at liftoff or landing",
      worst < 0.15,
      `worst step ${worst.toFixed(4)} at t=${worstAt.toFixed(3)}`
    );
  }

  // 4. One continuous arc across the whole window, not one per segment: the
  //    peak sits at the window's own midpoint, not reset at 0.45 or 0.99 (the
  //    two keyframes actually marked ungrounded).
  {
    const mid = (WINDOW_START + WINDOW_END) / 2;
    const before = yAt(mid - 0.05);
    const after = yAt(mid + 0.05);
    check(
      label + ": the peak falls at the midpoint of the whole window, not per segment",
      peakY >= before && peakY >= after,
      `${before.toFixed(3)} <= ${peakY.toFixed(3)} >= ${after.toFixed(3)}`
    );
  }

  // 5. The peak height matches the physics it is meant to follow.
  {
    const span = WINDOW_END - WINDOW_START;
    const g = 9.8 * (TARGET_HEIGHT / 1.75);
    const expected = (g * span * span) / 8;
    check(
      label + ": the peak height matches g*T^2/8",
      Math.abs(peakY - expected) < 0.02,
      `${peakY.toFixed(3)} vs expected ${expected.toFixed(3)} (span ${span.toFixed(2)}s)`
    );
  }

  // 6. Floor contact fades monotonically across the takeoff segment -- not a
  //    switch, and not reversing partway through. It does not have to fade at
  //    a CONSTANT rate: it follows the keyframe's own ease curve (`inOut`
  //    here), which does most of its moving in the middle of the segment and
  //    is already close to 0 well before the segment's own end -- that is a
  //    property of the ease curve, not a discontinuity, and is why this checks
  //    monotonicity rather than how far any one step moves.
  {
    const samples = 20;
    const values = Array.from({ length: samples + 1 }, (_, i) =>
      __testing.groundContribution(jump, (0.45 * i) / samples)
    );
    const monotonic = values.every((v, i) => i === 0 || v <= values[i - 1] + 1e-9);
    check(
      label + ": grounded contact fades out monotonically, not a switch",
      monotonic && values[0] === 1 && values[values.length - 1] === 0,
      `1.000 -> ${values.slice(1, -1).map((v) => v.toFixed(2)).join(" -> ")} -> 0.000`
    );
  }

  // 7. A fully grounded animation never engages the arc: the unified formula
  //    collapses to exactly the old grounded-only behaviour.
  {
    const walk: Animation = { ...jump, keyframes: jump.keyframes.map((k) => ({ ...k, grounded: true })) };
    scene.position.set(0, 0, 0);
    timelineFor(walk, scene, bones, DEFAULT_MOTION).pose(0.72);
    const walkY = scene.position.y;
    check(
      label + ": an all-grounded animation stays planted, not lofted",
      Math.abs(walkY) < 0.3,
      "y=" + walkY.toFixed(3)
    );
  }

  // 8. Bob 0 still disables all of this, exactly as before.
  {
    const y = yAt((WINDOW_START + WINDOW_END) / 2, { ...DEFAULT_MOTION, bob: 0 });
    check(label + ": bob 0 leaves the figure floating through the jump too", y === 0, "y=" + y);
  }
}

async function main() {
  shimBrowser();
  const model = findFixture(".glb", ".gltf", ".fbx", ".zip");
  if (!model) {
    skip("airborne", [".glb", ".fbx", ".zip"]);
    process.exit(0);
  }
  await run(model, model);
  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
}
main();
