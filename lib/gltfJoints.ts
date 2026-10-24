import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildJointLimits } from "@/lib/jointLimits";

export interface JointInfo {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ParsedModel {
  scene: THREE.Group;
  joints: JointInfo[];
}

const loader = new GLTFLoader();

/** A model needs at least two bones for there to be anything meaningful to animate. */
const MIN_JOINTS = 2;

export function parseGltfBuffer(buffer: ArrayBuffer): Promise<ParsedModel> {
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      "",
      (gltf) => {
        const joints: JointInfo[] = [];
        const bones: THREE.Bone[] = [];

        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Bone) {
            object.userData.restQuaternion = object.quaternion.toArray();
            bones.push(object);
            const parent = object.parent;
            joints.push({
              id: object.uuid,
              name: object.name || object.uuid,
              parentId: parent instanceof THREE.Bone ? parent.uuid : null,
            });
          }
        });

        if (joints.length < MIN_JOINTS) {
          reject(
            new Error(
              "This model has no usable skeleton. Upload a rigged .glb/.gltf (e.g. from Mixamo)."
            )
          );
          return;
        }

        // Measured here, where the skeleton is guaranteed to still be at rest.
        buildJointLimits(gltf.scene, bones);
        resolve({ scene: gltf.scene, joints });
      },
      (error) => {
        reject(
          error instanceof Error
            ? error
            : new Error("Could not parse this file as a .glb/.gltf model.")
        );
      }
    );
  });
}
