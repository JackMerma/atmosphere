"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const DOT_RADIUS = 0.03;
const DOT_COLOR = "#fa3600";
const SELECTED_COLOR = "#ffffff";

export default function JointHandles() {
  const scene = useAtmosphereStore((s) => s.scene);
  const joints = useAtmosphereStore((s) => s.joints);
  const locked = useAtmosphereStore((s) => s.locked);
  const selectedJointId = useAtmosphereStore((s) => s.selectedJointId);

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

  const selectedBone = bones.find((b) => b.uuid === selectedJointId) ?? null;

  return (
    <>
      {bones.map((bone) => (
        <JointDot key={bone.uuid} bone={bone} />
      ))}
      {selectedBone && (
        // "rotate" + "local": the handle bends THIS joint's own rotation,
        // matching how a real limb joint works, regardless of how the whole
        // model/camera is currently oriented.
        <TransformControls object={selectedBone} mode="rotate" space="local" size={0.6} />
      )}
    </>
  );
}

function JointDot({ bone }: { bone: THREE.Bone }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const selectedJointId = useAtmosphereStore((s) => s.selectedJointId);
  const setSelectedJoint = useAtmosphereStore((s) => s.setSelectedJoint);
  const isSelected = selectedJointId === bone.uuid;

  useFrame(() => {
    if (meshRef.current) bone.getWorldPosition(meshRef.current.position);
  });

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    setSelectedJoint(bone.uuid);
  }

  return (
    <mesh
      ref={meshRef}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[DOT_RADIUS * (hovered || isSelected ? 1.4 : 1), 12, 12]} />
      <meshBasicMaterial
        color={isSelected ? SELECTED_COLOR : DOT_COLOR}
        transparent
        opacity={isSelected ? 1 : hovered ? 0.95 : 0.85}
        depthTest={false}
      />
    </mesh>
  );
}
