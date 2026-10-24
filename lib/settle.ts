import * as THREE from "three";
import { constrainPose } from "@/lib/jointLimits";
import { resolveCollisions } from "@/lib/collision";

/** Rounds of "separate, then re-check the joints"; a handful is enough to come apart. */
const PASSES = 4;

/**
 * Settles a skeleton into a body that could actually exist: joint ranges first,
 * then self-collision, repeating until the parts are clear of each other.
 *
 * Every path that writes a pose goes through here -- the planner's vectors, a
 * Jev candidate, a photo estimate, a drag -- so they all obey the same physics.
 * The joint ranges follow the strength dial; the collisions never do.
 */
export function settlePose(bones: THREE.Bone[], passes = PASSES) {
  constrainPose(bones);
  bones.forEach((b) => b.updateMatrixWorld(true));

  for (let i = 0; i < passes; i++) {
    if (resolveCollisions(bones) === 0) break;
    constrainPose(bones);
    bones.forEach((b) => b.updateMatrixWorld(true));
  }
}
