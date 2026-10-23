"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Bounds } from "@react-three/drei";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import JointHandles from "@/components/JointHandles";

export default function RigViewport() {
  const scene = useAtmosphereStore((s) => s.scene);
  const isDraggingJoint = useAtmosphereStore((s) => s.isDraggingJoint);

  return (
    <div className="fixed inset-0">
      <Canvas camera={{ position: [2, 1.6, 3], fov: 45 }}>
        <color attach="background" args={["#f3efe4"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 3]} intensity={1.1} />
        <Grid
          args={[40, 40]}
          position={[0, 0, 0]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#d9d3c3"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#b3b3af"
          fadeDistance={28}
          fadeStrength={1.2}
          infiniteGrid
          raycast={() => null}
        />
        {scene && (
          <Bounds fit clip margin={1.4}>
            <primitive object={scene} />
          </Bounds>
        )}
        <JointHandles />
        {/* Camera orbit stays free; only an active joint drag suspends it,
            so the two gestures (pose a joint vs. look around) never fight. */}
        <OrbitControls makeDefault enabled={!isDraggingJoint} />
      </Canvas>
      {!scene && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-foreground/40">
          Upload a rigged model to see it here
        </p>
      )}
    </div>
  );
}
