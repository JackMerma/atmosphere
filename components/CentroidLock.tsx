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

/**
 * Pins the model's centroid to where it stood at rest, every frame, so poses,
 * falls and playback rotate it in place like a mannequin held in mid-air
 * instead of translating it across the scene. Also aims the camera orbit at
 * that point. Works for any rig: see `coreCentroid`.
 */
export default function CentroidLock() {
  const scene = useAtmosphereStore((s) => s.scene);
  const bones = useMemo(() => (scene ? collectBones(scene) : []), [scene]);

  useFrame((state) => {
    // Read from the store, not the hook value: this per-frame callback mutates the model.
    const model = useAtmosphereStore.getState().scene;
    if (!model || bones.length === 0) return;
    model.updateMatrixWorld(true);
    coreCentroid(bones, current);

    // First frame after a model loads it is still in its rest pose.
    let rest = model.userData[REST_KEY] as THREE.Vector3 | undefined;
    if (!rest) {
      rest = current.clone();
      model.userData[REST_KEY] = rest;
      const controls = state.controls as { target?: THREE.Vector3; update?: () => void } | null;
      controls?.target?.copy(rest);
      controls?.update?.();
      return;
    }

    if (current.distanceToSquared(rest) < 1e-10) return;
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
  });

  return null;
}
