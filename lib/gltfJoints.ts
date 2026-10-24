import * as THREE from "three";
import { buildJointLimits } from "@/lib/jointLimits";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { openModel, parseModel } from "@/lib/modelLoader";

export interface JointInfo {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ParsedModel {
  scene: THREE.Group;
  joints: JointInfo[];
}

/** A model needs at least two bones for there to be anything meaningful to animate. */
const MIN_JOINTS = 2;

/** Records the skeleton a freshly loaded model arrived in. */
function describe(scene: THREE.Group): ParsedModel {
  const joints: JointInfo[] = [];
  const bones: THREE.Bone[] = [];

  scene.traverse((object) => {
    if (object instanceof THREE.Bone) {
      object.userData.restQuaternion = object.quaternion.toArray();
      bones.push(object);
      joints.push({
        id: object.uuid,
        name: object.name || object.uuid,
        parentId: object.parent instanceof THREE.Bone ? object.parent.uuid : null,
      });
    }
  });

  if (joints.length < MIN_JOINTS) {
    throw new Error(
      "This model has no usable skeleton. Rig it first (upload it to Mixamo and download " +
        "the rigged .fbx), then try again."
    );
  }

  // Measured here, where the skeleton is guaranteed to still be at rest.
  buildJointLimits(scene, bones);
  return { scene, joints };
}

/** Distance of each model from the centre of the stage, along x; applied by its stage group. */
export const STAGE_OFFSET = 1.8;

export interface ParsedPair {
  /** Initial-state model, on the left. */
  scene: THREE.Group;
  /** Final-state model, on the right. */
  finalScene: THREE.Group;
  joints: JointInfo[];
}

/**
 * Reads an upload -- a .glb, .gltf or .fbx, or a .zip holding one with its
 * textures -- into two independent skeletons, placed side by side.
 *
 * Each copy gets its own bones, rest pose and measured joint limits, so posing
 * one never disturbs the other.
 */
export async function parseModelPair(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedPair> {
  const scene = await parseModel(openModel(buffer, fileName));
  // Cloned rather than parsed twice: reading a large FBX blocks the page for
  // seconds, and SkeletonUtils gives the copy its own bones and skinning.
  const finalScene = cloneSkinned(scene) as THREE.Group;

  const initial = describe(scene);
  describe(finalScene);
  return { scene, finalScene, joints: initial.joints };
}
