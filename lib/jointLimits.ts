import * as THREE from "three";
import { mapHumanoid, type HumanoidRig, type Limb, type Part, type Side } from "@/lib/humanoidRig";

const DEG = Math.PI / 180;

/**
 * Range of motion for one kind of limb segment, in degrees, measured from the
 * model's OWN rest pose, so an A-pose and a T-pose both work without tuning.
 */
interface Spec {
  /** Rotation about the bone's own long axis: the "unscrewing a jar" motion that corkscrews a mesh. */
  twist: number;
  /** How far the bone may tilt away from its rest direction, in any direction. */
  swing: number;
  /** Elbows and knees: they fold one way, in one plane, and never hyperextend. */
  hinge?: { max: number; slack: number };
  /** Directional swing limits, used only where the body frame gives a well-conditioned plane. */
  cone?: { front: number; back: number; out: number; in: number };
}

const SPECS: Record<Part, Spec> = {
  // A shoulder really is near-spherical; it is its twist that deforms a mesh.
  upperArm: { twist: 60, swing: 165 },
  foreArm: { twist: 70, swing: 150, hinge: { max: 150, slack: 5 } },
  // A hip swings far forward, barely backward, and hardly crosses the midline.
  thigh: { twist: 45, swing: 125, cone: { front: 120, back: 35, out: 65, in: 25 } },
  calf: { twist: 10, swing: 150, hinge: { max: 150, slack: 5 } },
  foot: { twist: 20, swing: 55 },
  neck: { twist: 60, swing: 50 },
};

/**
 * One bone's resolved limits. All vectors live in the frame the bone's
 * rotation-from-rest is measured in (its rest world frame), so they stay valid
 * however the parent moves.
 */
export interface BoneLimit {
  twist: number;
  swing: number;
  /** The bone's long axis: the direction it points at its child. */
  axis: THREE.Vector3;
  /** Rotating a positive angle about `bend` folds the bone the way the joint allows. */
  hinge?: { bend: THREE.Vector3; max: number; slack: number };
  cone?: {
    front: THREE.Vector3;
    out: THREE.Vector3;
    limits: { front: number; back: number; out: number; in: number };
  };
}

function segments(rig: HumanoidRig) {
  const list: { limb: Limb; part: Part; side: Side | null }[] = [];
  for (const side of ["l", "r"] as Side[]) {
    const parts: [Part, Limb | undefined][] = [
      ["upperArm", rig.upperArm[side]],
      ["foreArm", rig.foreArm[side]],
      ["thigh", rig.thigh[side]],
      ["calf", rig.calf[side]],
      ["foot", rig.foot[side]],
    ];
    for (const [part, limb] of parts) if (limb) list.push({ limb, part, side });
  }
  if (rig.neck) list.push({ limb: rig.neck, part: "neck", side: null });
  return list;
}

/**
 * Measures the uploaded skeleton while it is still in its rest pose and gives
 * every limb bone an anatomical range of motion, derived from the model's own
 * proportions rather than from hard-coded axes. Any rig whose arms and legs can
 * be recognised gets constrained; anything else is left alone rather than bent
 * by rules that may not apply to it.
 *
 * Call this once per model, with the model in its rest pose.
 */
export function buildJointLimits(scene: THREE.Object3D, bones: THREE.Bone[]) {
  let rig: HumanoidRig;
  try {
    rig = mapHumanoid(bones);
  } catch {
    return;
  }
  scene.updateMatrixWorld(true);

  const at = (limb: Limb) => limb.bone.getWorldPosition(new THREE.Vector3());
  const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

  // Body frame at rest: toward the character's own left, up the spine, out of its chest.
  const left = at(rig.thigh.l).sub(at(rig.thigh.r)).normalize();
  const up = mid(at(rig.upperArm.l), at(rig.upperArm.r))
    .sub(mid(at(rig.thigh.l), at(rig.thigh.r)))
    .normalize();
  const front = new THREE.Vector3().crossVectors(left, up).normalize();
  if (left.lengthSq() < 0.5 || up.lengthSq() < 0.5 || front.lengthSq() < 0.5) return;

  for (const { limb, part, side } of segments(rig)) {
    if (!limb.child) continue;
    const spec = SPECS[part];

    // Into the frame the bone's rotation-from-rest is expressed in.
    const toLocal = limb.bone.getWorldQuaternion(new THREE.Quaternion()).invert();

    const axis = limb.child
      .getWorldPosition(new THREE.Vector3())
      .sub(at(limb))
      .normalize()
      .applyQuaternion(toLocal);
    if (axis.lengthSq() < 0.5) continue;

    const limit: BoneLimit = { twist: spec.twist * DEG, swing: spec.swing * DEG, axis };

    if (spec.hinge) {
      // An elbow folds toward the body's front, a knee toward its back.
      const fold = front
        .clone()
        .multiplyScalar(part === "calf" ? -1 : 1)
        .applyQuaternion(toLocal);
      // Rotating a positive angle about axis x fold swings the bone's tip toward `fold`.
      const bend = new THREE.Vector3().crossVectors(axis, fold);
      if (bend.lengthSq() > 0.05) {
        limit.hinge = {
          bend: bend.normalize(),
          max: spec.hinge.max * DEG,
          slack: spec.hinge.slack * DEG,
        };
      }
    }

    if (spec.cone && side) {
      const coneFront = front.clone().applyQuaternion(toLocal).projectOnPlane(axis);
      const coneOut = left
        .clone()
        .multiplyScalar(side === "l" ? 1 : -1)
        .applyQuaternion(toLocal)
        .projectOnPlane(axis);
      // Skip the directional limits unless both axes survive the projection distinctly.
      if (coneFront.lengthSq() > 0.2 && coneOut.lengthSq() > 0.2) {
        coneFront.normalize();
        coneOut.normalize();
        if (Math.abs(coneFront.dot(coneOut)) < 0.8) {
          limit.cone = {
            front: coneFront,
            out: coneOut,
            limits: {
              front: spec.cone.front * DEG,
              back: spec.cone.back * DEG,
              out: spec.cone.out * DEG,
              in: spec.cone.in * DEG,
            },
          };
        }
      }
    }

    limb.bone.userData.jointLimit = limit;
  }
}

const restQuat = new THREE.Quaternion();
const deltaQuat = new THREE.Quaternion();
const twistQuat = new THREE.Quaternion();
const twistInv = new THREE.Quaternion();
const swingQuat = new THREE.Quaternion();
const vector = new THREE.Vector3();
const tip = new THREE.Vector3();

/** Elliptical blend of the directional limits, by where the bone's tip is heading. */
function coneLimit(limit: BoneLimit, swingAxis: THREE.Vector3) {
  if (!limit.cone) return Infinity;
  tip.crossVectors(swingAxis, limit.axis);
  if (tip.lengthSq() < 1e-12) return Infinity;
  tip.normalize();

  const { front, out, limits } = limit.cone;
  const towardFront = tip.dot(front);
  const towardOut = tip.dot(out);
  const spread = Math.hypot(
    towardFront / (towardFront >= 0 ? limits.front : limits.back),
    towardOut / (towardOut >= 0 ? limits.out : limits.in)
  );
  return spread > 1e-6 ? 1 / spread : Infinity;
}

/**
 * Keeps one bone inside its range of motion, by splitting its rotation away
 * from rest into a swing (which way the limb points) and a twist (rotation
 * about the limb's own axis), then clamping each. Swinging a limb around is
 * untouched up to its limit; it just can't corkscrew or bend the wrong way.
 * Bones with no measured limit — the hips, the spine, an unrecognised rig —
 * are left exactly as they are.
 */
export function constrainBone(bone: THREE.Bone) {
  const limit = bone.userData.jointLimit as BoneLimit | undefined;
  const rest = bone.userData.restQuaternion as number[] | undefined;
  if (!limit || !rest) return;

  // Rotation away from rest, in the bone's rest frame: delta = swing * twist.
  restQuat.fromArray(rest);
  deltaQuat.copy(restQuat).invert().multiply(bone.quaternion);
  if (deltaQuat.w < 0) {
    deltaQuat.set(-deltaQuat.x, -deltaQuat.y, -deltaQuat.z, -deltaQuat.w);
  }

  const { axis } = limit;
  const along = vector.set(deltaQuat.x, deltaQuat.y, deltaQuat.z).dot(axis);
  twistQuat.set(axis.x * along, axis.y * along, axis.z * along, deltaQuat.w);
  if (twistQuat.lengthSq() < 1e-12) twistQuat.identity();
  else twistQuat.normalize();
  swingQuat.copy(deltaQuat).multiply(twistInv.copy(twistQuat).invert());

  let changed = false;

  // `along` and `deltaQuat.w` share a scale, so this angle is correct before normalising.
  const twistAngle = 2 * Math.atan2(along, deltaQuat.w);
  if (Math.abs(twistAngle) > limit.twist) {
    twistQuat.setFromAxisAngle(axis, Math.sign(twistAngle) * limit.twist);
    changed = true;
  }

  if (swingQuat.w < 0) {
    swingQuat.set(-swingQuat.x, -swingQuat.y, -swingQuat.z, -swingQuat.w);
  }
  const swingAngle = 2 * Math.acos(Math.min(1, swingQuat.w));
  vector.set(swingQuat.x, swingQuat.y, swingQuat.z);

  if (vector.lengthSq() > 1e-12) {
    vector.normalize();
    if (limit.hinge) {
      // Project onto the hinge axis, so an elbow or knee can only fold its one
      // way: sideways intent is dropped rather than turned into a fold.
      const signed = swingAngle * vector.dot(limit.hinge.bend);
      const folded = Math.min(Math.max(signed, -limit.hinge.slack), limit.hinge.max);
      swingQuat.setFromAxisAngle(limit.hinge.bend, folded);
      changed = true;
    } else {
      const max = Math.min(limit.swing, coneLimit(limit, vector));
      if (swingAngle > max) {
        swingQuat.setFromAxisAngle(vector, max);
        changed = true;
      }
    }
  } else if (limit.hinge && swingAngle > limit.hinge.max) {
    // A half-turn swing has no usable axis; fold it to the limit instead.
    swingQuat.setFromAxisAngle(limit.hinge.bend, limit.hinge.max);
    changed = true;
  }

  if (changed) bone.quaternion.copy(restQuat).multiply(swingQuat).multiply(twistQuat);
}

/**
 * Clamps a whole skeleton back inside its range of motion. Every bone's limits
 * are measured against its own local rotation, so order does not matter and no
 * world matrices are read; the caller refreshes those afterwards.
 */
export function constrainPose(bones: THREE.Bone[]) {
  for (const bone of bones) constrainBone(bone);
}
