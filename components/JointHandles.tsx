"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const HANDLE_RADIUS = 0.035;
const DRAG_SENSITIVITY = 0.01;

export default function JointHandles() {
  const scene = useAtmosphereStore((s) => s.scene);
  const joints = useAtmosphereStore((s) => s.joints);
  const locked = useAtmosphereStore((s) => s.locked);

  const bones = useMemo(() => {
    if (!scene) return [];
    const byId = new Map<string, THREE.Bone>();
    scene.traverse((object) => {
      if (object instanceof THREE.Bone) byId.set(object.uuid, object);
    });
    return joints
      .map((joint) => byId.get(joint.id))
      .filter((bone): bone is THREE.Bone => !!bone);
  }, [scene, joints]);

  if (!locked) return null;

  return (
    <>
      {bones.map((bone) => (
        <JointHandle key={bone.uuid} bone={bone} />
      ))}
    </>
  );
}

function JointHandle({ bone }: { bone: THREE.Bone }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  useFrame(() => {
    if (meshRef.current) bone.getWorldPosition(meshRef.current.position);
  });

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
  }

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    if (!dragOrigin.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragOrigin.current.x;
    const dy = e.clientY - dragOrigin.current.y;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    bone.rotation.y += dx * DRAG_SENSITIVITY;
    bone.rotation.x += dy * DRAG_SENSITIVITY;
  }

  function handlePointerUp(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragOrigin.current = null;
  }

  return (
    <mesh
      ref={meshRef}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <sphereGeometry args={[HANDLE_RADIUS, 12, 12]} />
      <meshBasicMaterial
        color={hovered ? "#ff4d1a" : "#ffffff"}
        transparent
        opacity={hovered ? 0.95 : 0.4}
        depthTest={false}
      />
    </mesh>
  );
}
