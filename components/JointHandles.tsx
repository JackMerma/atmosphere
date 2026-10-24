"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
import { HANDLES_NAME } from "@/components/ViewportBridge";
import { reachToward } from "@/lib/ikChain";
import { anchorFor } from "@/lib/anchor";
import { settlePose } from "@/lib/settle";

const DOT_RADIUS = 0.03;
const DOT_COLOR = "#fa3600";
const ACTIVE_COLOR = "#0090ff";

interface DragSession {
  /** The joint whose dot is being dragged — it follows the cursor. */
  handle: THREE.Bone;
  /** Every bone of this model, settled together after each move. */
  bones: THREE.Bone[];
  /** Camera-facing plane the cursor is projected onto for the whole gesture. */
  plane: THREE.Plane;
}

// Scratch objects reused every pointer move instead of allocating new ones.
const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const target = new THREE.Vector3();
const handleWorld = new THREE.Vector3();

/** Orange drag handles for one model's joints; hidden while an animation is built or played. */
export default function JointHandles({ scene }: { scene: THREE.Object3D }) {
  const setDraggingJoint = useAtmosphereStore((s) => s.setDraggingJoint);
  const capturing = useAtmosphereStore((s) => s.capturing);
  const busy = useAtmosphereStore((s) => s.generating || s.playing);
  const { camera, gl } = useThree();

  const [activeId, setActiveId] = useState<string | null>(null);
  const dragRef = useRef<DragSession | null>(null);

  const bones = useMemo(() => collectBones(scene), [scene]);

  function beginDrag(handle: THREE.Bone) {
    if (!(handle.parent instanceof THREE.Bone)) return;

    handle.getWorldPosition(handleWorld);
    const normal = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, handleWorld);

    dragRef.current = { handle, bones, plane };
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

      // The joints above the handle share the pull, so a tug on the wrist
      // bends the elbow, swings the shoulder and leans the chest.
      reachToward(drag.handle, target, anchorFor(drag.bones));
      settlePose(drag.bones, 2);
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
    <group name={HANDLES_NAME} visible={!capturing && !busy}>
      {bones.map((bone) => (
        <JointDot
          key={bone.uuid}
          bone={bone}
          active={activeId === bone.uuid}
          onGrab={beginDrag}
        />
      ))}
    </group>
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
