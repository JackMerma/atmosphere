"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const DOT_RADIUS = 0.03;
const DOT_COLOR = "#fa3600";
const ACTIVE_COLOR = "#0090ff";

// Scratch objects reused every drag frame instead of allocating new ones.
const scratchOffset = new THREE.Vector3();
const scratchHit = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();
const scratchDeltaQuat = new THREE.Quaternion();
const scratchBoneWorldQuat = new THREE.Quaternion();
const scratchNewWorldQuat = new THREE.Quaternion();
const scratchParentWorldQuat = new THREE.Quaternion();

/**
 * Where a camera ray hits an imaginary sphere centered at `center`. If the
 * ray misses the sphere (drag went past its silhouette), falls back to the
 * closest point on the ray to the center — the standard arcball behavior.
 */
function raySphereHit(
  rayOrigin: THREE.Vector3,
  rayDir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
  out: THREE.Vector3
) {
  scratchOffset.subVectors(rayOrigin, center);
  const b = scratchOffset.dot(rayDir);
  const c = scratchOffset.dot(scratchOffset) - radius * radius;
  const disc = b * b - c;
  const t = disc >= 0 ? -b - Math.sqrt(disc) : -b;
  return out.copy(rayDir).multiplyScalar(t).add(rayOrigin);
}

interface DragState {
  pivot: THREE.Vector3;
  radius: number;
  prevHit: THREE.Vector3;
}

/**
 * Virtual-trackball (arcball) rotation: treats the joint as a handle on an
 * imaginary sphere and rotates it by exactly the angle/axis that takes the
 * ray-sphere hit point under the cursor from its previous position to its
 * new one, so the handle keeps tracking the cursor directly — press and
 * drag in one gesture, however the model/camera is currently oriented.
 */
function applyArcballDrag(bone: THREE.Bone, drag: DragState, ray: THREE.Ray) {
  const hit = raySphereHit(ray.origin, ray.direction, drag.pivot, drag.radius, scratchHit)
    .sub(drag.pivot)
    .normalize();

  const axis = scratchAxis.crossVectors(drag.prevHit, hit);
  const axisLength = axis.length();
  if (axisLength > 1e-6) {
    axis.normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(drag.prevHit.dot(hit), -1, 1));
    scratchDeltaQuat.setFromAxisAngle(axis, angle);

    bone.getWorldQuaternion(scratchBoneWorldQuat);
    scratchNewWorldQuat.multiplyQuaternions(scratchDeltaQuat, scratchBoneWorldQuat);

    if (bone.parent) {
      bone.parent.getWorldQuaternion(scratchParentWorldQuat).invert();
      bone.quaternion.multiplyQuaternions(scratchParentWorldQuat, scratchNewWorldQuat);
    } else {
      bone.quaternion.copy(scratchNewWorldQuat);
    }
  }

  drag.prevHit.copy(hit);
}

export default function JointHandles() {
  const scene = useAtmosphereStore((s) => s.scene);
  const joints = useAtmosphereStore((s) => s.joints);

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

  return (
    <>
      {bones.map((bone) => (
        <JointDot key={bone.uuid} bone={bone} />
      ))}
    </>
  );
}

function JointDot({ bone }: { bone: THREE.Bone }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const setDraggingJoint = useAtmosphereStore((s) => s.setDraggingJoint);

  useFrame(() => {
    if (meshRef.current) bone.getWorldPosition(meshRef.current.position);
  });

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const pivot = bone.getWorldPosition(new THREE.Vector3());
    const radius = Math.max(e.camera.position.distanceTo(pivot) * 0.3, 0.05);
    const prevHit = raySphereHit(e.ray.origin, e.ray.direction, pivot, radius, new THREE.Vector3())
      .sub(pivot)
      .normalize();

    dragRef.current = { pivot, radius, prevHit };
    setDragging(true);
    setDraggingJoint(true);
  }

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    const drag = dragRef.current;
    if (!drag) return;
    e.stopPropagation();
    applyArcballDrag(bone, drag, e.ray);
  }

  function handlePointerUp(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setDragging(false);
    setDraggingJoint(false);
  }

  const active = hovered || dragging;

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
      <sphereGeometry args={[DOT_RADIUS * (active ? 1.4 : 1), 12, 12]} />
      <meshBasicMaterial
        color={dragging ? ACTIVE_COLOR : DOT_COLOR}
        transparent
        opacity={active ? 1 : 0.85}
        depthTest={false}
      />
    </mesh>
  );
}
