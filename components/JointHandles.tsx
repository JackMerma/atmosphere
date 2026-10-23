"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const DOT_RADIUS = 0.03;
const DOT_COLOR = "#fa3600";
const ACTIVE_COLOR = "#0090ff";

interface DragSession {
  /** The joint whose dot is being dragged — it follows the cursor. */
  handle: THREE.Bone;
  /** The bone actually rotated: the handle's parent, which swings the handle. */
  bone: THREE.Bone;
  /** World position the rotation happens around (the parent joint). */
  pivot: THREE.Vector3;
  /** Camera-facing plane the cursor is projected onto for the whole gesture. */
  plane: THREE.Plane;
}

// Scratch objects reused every pointer move instead of allocating new ones.
const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3();
const desiredDir = new THREE.Vector3();
const currentDir = new THREE.Vector3();
const handleWorld = new THREE.Vector3();
const deltaQuat = new THREE.Quaternion();
const boneWorldQuat = new THREE.Quaternion();
const newWorldQuat = new THREE.Quaternion();
const parentWorldQuat = new THREE.Quaternion();

export default function JointHandles() {
  const scene = useAtmosphereStore((s) => s.scene);
  const joints = useAtmosphereStore((s) => s.joints);
  const setDraggingJoint = useAtmosphereStore((s) => s.setDraggingJoint);
  const { camera, gl } = useThree();

  const [activeId, setActiveId] = useState<string | null>(null);
  const dragRef = useRef<DragSession | null>(null);

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

  function beginDrag(handle: THREE.Bone) {
    const bone = handle.parent;
    if (!(bone instanceof THREE.Bone)) return;

    handle.getWorldPosition(handleWorld);
    const pivot = bone.getWorldPosition(new THREE.Vector3());
    if (handleWorld.distanceToSquared(pivot) < 1e-8) return;

    const normal = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, handleWorld);

    dragRef.current = { handle, bone, pivot, plane };
    setActiveId(handle.uuid);
    // Suspends OrbitControls for this gesture, so grabbing a joint never
    // also swings the camera.
    setDraggingJoint(true);
  }

  useEffect(() => {
    if (!activeId) return;

    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const rect = gl.domElement.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(drag.plane, target)) return;

      desiredDir.subVectors(target, drag.pivot);
      drag.handle.getWorldPosition(handleWorld);
      currentDir.subVectors(handleWorld, drag.pivot);
      if (desiredDir.lengthSq() < 1e-8 || currentDir.lengthSq() < 1e-8) return;
      desiredDir.normalize();
      currentDir.normalize();

      // Swing the parent bone so the dragged joint points at the cursor.
      deltaQuat.setFromUnitVectors(currentDir, desiredDir);
      drag.bone.getWorldQuaternion(boneWorldQuat);
      newWorldQuat.multiplyQuaternions(deltaQuat, boneWorldQuat);

      if (drag.bone.parent) {
        drag.bone.parent.getWorldQuaternion(parentWorldQuat).invert();
        drag.bone.quaternion.multiplyQuaternions(parentWorldQuat, newWorldQuat);
      } else {
        drag.bone.quaternion.copy(newWorldQuat);
      }
      drag.bone.updateMatrixWorld(true);
    }

    function endDrag() {
      dragRef.current = null;
      setActiveId(null);
      setDraggingJoint(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [activeId, camera, gl, setDraggingJoint]);

  return (
    <>
      {bones.map((bone) => (
        <JointDot
          key={bone.uuid}
          bone={bone}
          active={activeId === bone.uuid}
          onGrab={beginDrag}
        />
      ))}
    </>
  );
}

function JointDot({
  bone,
  active,
  onGrab,
}: {
  bone: THREE.Bone;
  active: boolean;
  onGrab: (bone: THREE.Bone) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (meshRef.current) bone.getWorldPosition(meshRef.current.position);
  });

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    onGrab(bone);
  }

  const highlighted = hovered || active;

  return (
    <mesh
      ref={meshRef}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[DOT_RADIUS * (highlighted ? 1.4 : 1), 12, 12]} />
      <meshBasicMaterial
        color={active ? ACTIVE_COLOR : DOT_COLOR}
        transparent
        opacity={highlighted ? 1 : 0.85}
        depthTest={false}
      />
    </mesh>
  );
}
