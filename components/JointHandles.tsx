"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const HANDLE_RADIUS = 0.035;

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
 * new one. Unlike rotating around fixed camera axes, this stays correct
 * however the model/camera is currently oriented — the handle keeps
 * tracking the cursor instead of drifting off in the model's rest-pose
 * directions.
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
  const dragRef = useRef<DragState | null>(null);

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
        color={hovered ? "#fa3600" : "#ffffff"}
        transparent
        opacity={hovered ? 0.95 : 0.4}
        depthTest={false}
      />
    </mesh>
  );
}
