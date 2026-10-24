"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
import { coreCentroid } from "@/lib/centroid";

const REST_KEY = "restCentroid";
const current = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const middle = new THREE.Vector3();

/**
 * Pins each model's centroid to where it stood at rest, every frame, so poses,
 * falls and playback rotate it in place like a mannequin held in mid-air
 * instead of translating it across the stage. Also aims the camera orbit at
 * the point between the two models. Works for any rig: see `coreCentroid`.
 */
export default function CentroidLock() {
  const scene = useAtmosphereStore((s) => s.scene);
  const finalScene = useAtmosphereStore((s) => s.finalScene);
  const initialBones = useMemo(() => (scene ? collectBones(scene) : []), [scene]);
  const finalBones = useMemo(() => (finalScene ? collectBones(finalScene) : []), [finalScene]);

  useFrame((state) => {
    // Read from the store, not the hook values: this per-frame callback mutates the models.
    const { scene: left, finalScene: right } = useAtmosphereStore.getState();
    const models: [THREE.Group | null, THREE.Bone[]][] = [
      [left, initialBones],
      [right, finalBones],
    ];

    for (const [model, bones] of models) {
      if (!model || bones.length === 0) continue;
      model.updateMatrixWorld(true);
      coreCentroid(bones, current);

      // First frame after a model loads it is still in its rest pose.
      const rest = model.userData[REST_KEY] as THREE.Vector3 | undefined;
      if (!rest) {
        model.userData[REST_KEY] = current.clone();
        continue;
      }
      if (current.distanceToSquared(rest) < 1e-10) continue;

      // Shift the whole model by the drift, converting through its parent's transform.
      from.copy(current);
      to.copy(rest);
      if (model.parent) {
        model.parent.updateWorldMatrix(true, false);
        model.parent.worldToLocal(from);
        model.parent.worldToLocal(to);
      }
      model.position.add(to.sub(from));
      model.updateMatrixWorld(true);
    }

    // Aim the orbit once, when both rest centroids are known.
    const a = left?.userData[REST_KEY] as THREE.Vector3 | undefined;
    const b = right?.userData[REST_KEY] as THREE.Vector3 | undefined;
    const key = "__orbitAimed";
    if (a && b && left && !left.userData[key]) {
      left.userData[key] = true;
      const controls = state.controls as { target?: THREE.Vector3; update?: () => void } | null;
      controls?.target?.copy(middle.addVectors(a, b).multiplyScalar(0.5));
      controls?.update?.();
    }
  });

  return null;
}
