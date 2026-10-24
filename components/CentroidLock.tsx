"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
import { coreCentroid } from "@/lib/centroid";

const REST_KEY = "restCentroid";
const current = new THREE.Vector3();

/**
 * Holds each model over its own spot on the stage, every frame, so swinging a
 * limb never walks the body sideways.
 *
 * Only sideways: height is left alone, because that is what carries the weight
 * of a pose. A grounded model gets its height from the floor under its feet
 * (see `groundModel`); anything else keeps the height it already had.
 *
 * Works in the model's PARENT space, so the stage group is free to slide the
 * models around (see StageChoreography) without this fighting it back.
 */
export default function CentroidLock() {
  const scene = useAtmosphereStore((s) => s.scene);
  const finalScene = useAtmosphereStore((s) => s.finalScene);
  const initialBones = useMemo(() => (scene ? collectBones(scene) : []), [scene]);
  const finalBones = useMemo(() => (finalScene ? collectBones(finalScene) : []), [finalScene]);

  useFrame(() => {
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
      if (model.parent) {
        model.parent.updateWorldMatrix(true, false);
        model.parent.worldToLocal(current);
      }

      // First frame after a model loads it is still in its rest pose.
      const rest = model.userData[REST_KEY] as THREE.Vector3 | undefined;
      if (!rest) {
        model.userData[REST_KEY] = current.clone();
        continue;
      }
      // Height belongs to the floor, not to this.
      current.y = rest.y;
      if (current.distanceToSquared(rest) < 1e-10) continue;

      model.position.add(rest).sub(current);
      model.updateMatrixWorld(true);
    }
  });

  return null;
}
