import * as THREE from "three";
import { buildJointLimits, constrainBone, setLimitStrength } from "@/lib/jointLimits";

const DEG = Math.PI / 180;

/** Minimal Mixamo-named humanoid in a T-pose, built from scratch. */
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

  for (const side of ["Left", "Right"] as const) {
    const sx = side === "Left" ? 1 : -1; // the character's own left is +x
    const shoulder = add(hips, "mixamorig" + side + "Shoulder", new THREE.Vector3(sx * 0.1, 0.5, 0));
    const arm = add(shoulder, "mixamorig" + side + "Arm", new THREE.Vector3(sx * 0.1, 0, 0));
    const fore = add(arm, "mixamorig" + side + "ForeArm", new THREE.Vector3(sx * 0.3, 0, 0));
    add(fore, "mixamorig" + side + "Hand", new THREE.Vector3(sx * 0.3, 0, 0));

    const upLeg = add(hips, "mixamorig" + side + "UpLeg", new THREE.Vector3(sx * 0.1, 0, 0));
    const leg = add(upLeg, "mixamorig" + side + "Leg", new THREE.Vector3(0, -0.45, 0));
    const foot = add(leg, "mixamorig" + side + "Foot", new THREE.Vector3(0, -0.45, 0));
    add(foot, "mixamorig" + side + "ToeBase", new THREE.Vector3(0, -0.05, 0.15));
  }
  const neck = add(hips, "mixamorigNeck", new THREE.Vector3(0, 0.55, 0));
  add(neck, "mixamorigHead", new THREE.Vector3(0, 0.12, 0));

  for (const b of bones) b.userData.restQuaternion = b.quaternion.toArray();
  root.updateMatrixWorld(true);
  buildJointLimits(root, bones);
  return { root, bones, by: (n: string) => bones.find((b) => b.name === n)! };
}

const results: string[] = [];
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
}

const { root, by } = buildRig();
setLimitStrength(1); // the assertions below describe the strict end of the dial

// Every limb segment got a measured limit; the hips (the root) deliberately did not.
for (const name of ["LeftArm", "LeftForeArm", "LeftUpLeg", "LeftLeg", "LeftFoot"]) {
  check(name + " has limits", !!by("mixamorig" + name).userData.jointLimit, "");
}
check("Hips unconstrained", !by("mixamorigHips").userData.jointLimit, "(root stays free)");
check("Neck has limits", !!by("mixamorigNeck").userData.jointLimit, "");

/** Angle, in degrees, between where a bone points now and where it pointed at rest. */
function swingOf(bone: THREE.Bone) {
  const rest = new THREE.Quaternion().fromArray(bone.userData.restQuaternion);
  const delta = rest.clone().invert().multiply(bone.quaternion);
  const axis = (bone.userData.jointLimit as { axis: THREE.Vector3 }).axis;
  return THREE.MathUtils.radToDeg(axis.angleTo(axis.clone().applyQuaternion(delta)));
}

/** Rotation about the bone's own long axis, in degrees. */
function twistOf(bone: THREE.Bone) {
  const rest = new THREE.Quaternion().fromArray(bone.userData.restQuaternion);
  const delta = rest.clone().invert().multiply(bone.quaternion);
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const axis = (bone.userData.jointLimit as { axis: THREE.Vector3 }).axis;
  const along = new THREE.Vector3(delta.x, delta.y, delta.z).dot(axis);
  return Math.abs(THREE.MathUtils.radToDeg(2 * Math.atan2(along, delta.w)));
}

const spin = (bone: THREE.Bone, axis: THREE.Vector3, degrees: number) => {
  bone.quaternion
    .fromArray(bone.userData.restQuaternion)
    .multiply(new THREE.Quaternion().setFromAxisAngle(axis, degrees * DEG));
};
const reset = (bone: THREE.Bone) => bone.quaternion.fromArray(bone.userData.restQuaternion);

// 1. A full 180-degree corkscrew of the thigh is clamped to its twist limit (45).
{
  const thigh = by("mixamorigLeftUpLeg");
  spin(thigh, (thigh.userData.jointLimit as { axis: THREE.Vector3 }).axis, 180);
  constrainBone(thigh);
  const t = twistOf(thigh);
  check("Thigh 180 twist clamped", t <= 81, "twist=" + t.toFixed(1) + "deg (limit 80)");
  reset(thigh);
}

// 2. A knee bent the WRONG way (hyperextended) is pushed back to straight.
{
  const calf = by("mixamorigLeftLeg");
  const hinge = (calf.userData.jointLimit as { hinge: { bend: THREE.Vector3 } }).hinge;
  spin(calf, hinge.bend, -80);
  constrainBone(calf);
  const s = swingOf(calf);
  check("Knee hyperextension blocked", s <= 16, "swing=" + s.toFixed(1) + "deg (slack 15)");
  reset(calf);
}

// 3. A knee bent the RIGHT way is kept, and the ankle really does travel backward.
{
  const calf = by("mixamorigLeftLeg");
  const foot = by("mixamorigLeftFoot");
  const hinge = (calf.userData.jointLimit as { hinge: { bend: THREE.Vector3 } }).hinge;
  spin(calf, hinge.bend, 90);
  constrainBone(calf);
  const s = swingOf(calf);
  root.updateMatrixWorld(true);
  const ankleZ = foot.getWorldPosition(new THREE.Vector3()).z;
  check("Knee folds its own way 90", Math.abs(s - 90) < 2, "swing=" + s.toFixed(1) + "deg");
  check("Ankle moves behind the body", ankleZ < -0.1, "ankle z=" + ankleZ.toFixed(2) + " (front is +z)");
  reset(calf);
  root.updateMatrixWorld(true);
}

// 4. A knee twisted sideways is snapped back onto its hinge plane.
{
  const calf = by("mixamorigLeftLeg");
  const hinge = (calf.userData.jointLimit as { hinge: { bend: THREE.Vector3 } }).hinge;
  const axis = (calf.userData.jointLimit as { axis: THREE.Vector3 }).axis;
  const sideways = hinge.bend.clone().cross(axis).normalize();
  spin(calf, sideways, 70);
  constrainBone(calf);
  const s = swingOf(calf);
  check("Knee sideways bend removed", s <= 16, "swing=" + s.toFixed(1) + "deg");
  reset(calf);
}

// 4b. A diagonal bend keeps only its legal component.
{
  const calf = by("mixamorigLeftLeg");
  const hinge = (calf.userData.jointLimit as { hinge: { bend: THREE.Vector3 } }).hinge;
  const axis = (calf.userData.jointLimit as { axis: THREE.Vector3 }).axis;
  const diagonal = hinge.bend
    .clone()
    .add(hinge.bend.clone().cross(axis))
    .normalize();
  spin(calf, diagonal, 90);
  constrainBone(calf);
  const s = swingOf(calf);
  check("Diagonal knee bend projected", Math.abs(s - 90 * Math.SQRT1_2) < 3, "swing=" + s.toFixed(1) + "deg (expect ~64)");
  reset(calf);
}

// 5. The hip allows a big forward kick but very little backward swing.
{
  const thigh = by("mixamorigLeftUpLeg");
  const kick = (towardFront: boolean) => {
    // The thigh points down (0,-1,0); rotating about -x sweeps its tip toward +z (the front).
    spin(thigh, new THREE.Vector3(towardFront ? -1 : 1, 0, 0), 110);
    constrainBone(thigh);
    return swingOf(thigh);
  };
  const forward = kick(true);
  const backward = kick(false);
  check("Hip kicks forward freely", forward > 100, "swing=" + forward.toFixed(1) + "deg (limit 165)");
  check("Hip barely swings backward", backward < 95, "swing=" + backward.toFixed(1) + "deg (limit 90)");
  check("Hip front/back asymmetric", forward > backward + 10, forward.toFixed(0) + " vs " + backward.toFixed(0));
  reset(thigh);
}

// 6. A legal pose is left untouched: a mild arm swing must not be "corrected".
{
  const arm = by("mixamorigLeftArm");
  spin(arm, new THREE.Vector3(0, 0, 1), 40);
  const before = arm.quaternion.clone();
  constrainBone(arm);
  const moved = arm.quaternion.angleTo(before);
  check("Legal arm swing untouched", moved < 1e-6, "moved " + moved.toFixed(8) + "rad");
  reset(arm);
}

// 7. Shoulders stay mobile: 150 degrees of swing is allowed through.
{
  const arm = by("mixamorigLeftArm");
  spin(arm, new THREE.Vector3(0, 0, 1), 150);
  constrainBone(arm);
  const s = swingOf(arm);
  check("Shoulder keeps wide range", s > 145, "swing=" + s.toFixed(1) + "deg (limit 170)");
  reset(arm);
}

// ---- the flexibility dial ----------------------------------------------
const kneeTwist = (st: number) => {
  setLimitStrength(st);
  const calf = by("mixamorigLeftLeg");
  spin(calf, (calf.userData.jointLimit as { axis: THREE.Vector3 }).axis, 120);
  constrainBone(calf);
  const t = twistOf(calf);
  reset(calf);
  return t;
};
{
  const strict = kneeTwist(1);
  const half = kneeTwist(0.5);
  const off = kneeTwist(0);
  check("Strength 1 clamps knee twist", strict <= 36, "twist=" + strict.toFixed(1) + "deg (limit 35)");
  check("Strength 0.5 is looser", half > strict + 20 && half < 120, "twist=" + half.toFixed(1) + "deg");
  check("Strength 0 leaves it alone", Math.abs(off - 120) < 1, "twist=" + off.toFixed(1) + "deg (asked 120)");
  check("Dial is monotonic", strict < half && half < off, strict.toFixed(0) + " < " + half.toFixed(0) + " < " + off.toFixed(0));
}
{
  const hyper = (st: number) => {
    setLimitStrength(st);
    const calf = by("mixamorigLeftLeg");
    const hinge = (calf.userData.jointLimit as { hinge: { bend: THREE.Vector3 } }).hinge;
    spin(calf, hinge.bend, -70);
    constrainBone(calf);
    const s = swingOf(calf);
    reset(calf);
    return s;
  };
  const strict = hyper(1);
  const half = hyper(0.5);
  const off = hyper(0);
  check("Hyperextension blocked at 1", strict <= 16, "swing=" + strict.toFixed(1) + "deg");
  check("Hyperextension partly allowed at 0.5", half > strict + 10, "swing=" + half.toFixed(1) + "deg");
  check("Hyperextension free at 0", Math.abs(off - 70) < 1, "swing=" + off.toFixed(1) + "deg (asked 70)");
}
setLimitStrength(1);

console.log(results.join("\n"));
console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
