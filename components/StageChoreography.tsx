"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { STAGE_OFFSET } from "@/lib/gltfJoints";
import { ease } from "@/lib/easing";

/** Seconds the two models take to snap together, and to spring back apart. */
const MERGE_TIME = 0.55;
const PART_TIME = 0.7;
/** How far past each other they drift at the peak of the repel, as a fraction of the offset. */
const REBOUND = 0.12;

/** Every material of a model, so the one that merges away can be faded out. */
function materialsOf(root: THREE.Object3D) {
  const found = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material) found.add(material);
    }
  });
  return [...found];
}

/**
 * Drives the two stage models like magnets: when playback starts they rush
 * together into one figure (the final-state copy fading out as it lands on the
 * initial one), and when it stops they spring back apart, overshooting
 * slightly before settling into exactly the poses they held before.
 *
 * It owns the stage GROUPS and only ever moves those, never the models
 * themselves, so CentroidLock keeps each body pinned in place inside its group.
 */
export default function StageChoreography({ left, right }: { left: ReactNode; right: ReactNode }) {
  const finalScene = useAtmosphereStore((s) => s.finalScene);
  const leftStage = useRef<THREE.Group>(null);
  const rightStage = useRef<THREE.Group>(null);
  /** 0 = apart, 1 = merged. */
  const merge = useRef(0);

  const materials = useMemo(() => (finalScene ? materialsOf(finalScene) : []), [finalScene]);

  // Fading needs transparency on, and the flag has to be restored on unmount.
  useEffect(() => {
    const previous = materials.map((m) => m.transparent);
    materials.forEach((m) => {
      m.transparent = true;
    });
    return () => {
      materials.forEach((m, i) => {
        m.transparent = previous[i];
        m.opacity = 1;
      });
    };
  }, [materials]);

  useFrame((_, delta) => {
    const playing = useAtmosphereStore.getState().playing;
    const target = playing ? 1 : 0;
    if (merge.current === target && !leftStage.current) return;

    const speed = delta / (playing ? MERGE_TIME : PART_TIME);
    merge.current = playing
      ? Math.min(1, merge.current + speed)
      : Math.max(0, merge.current - speed);

    // Magnets: snapping together accelerates, flying apart overshoots and settles.
    const t = playing ? ease("in", merge.current) : ease("overshoot", merge.current);
    const spread = STAGE_OFFSET * (1 - t) * (1 + REBOUND * (1 - t) * (playing ? 0 : 1));

    if (leftStage.current) leftStage.current.position.x = -spread;
    if (rightStage.current) {
      rightStage.current.position.x = spread;
      rightStage.current.visible = t < 0.999;
    }
    // The copy dissolves as it lands, so the pair reads as one figure.
    const opacity = 1 - THREE.MathUtils.smoothstep(t, 0.45, 0.98);
    materials.forEach((m) => {
      m.opacity = opacity;
    });
  });

  return (
    <>
      <group ref={leftStage} position={[-STAGE_OFFSET, 0, 0]}>
        {left}
      </group>
      <group ref={rightStage} position={[STAGE_OFFSET, 0, 0]}>
        {right}
      </group>
    </>
  );
}
