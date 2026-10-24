"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import JointHandles from "@/components/JointHandles";
import ViewportBridge from "@/components/ViewportBridge";
import PlaybackDriver from "@/components/PlaybackDriver";
import CentroidLock from "@/components/CentroidLock";

export default function RigViewport() {
  const scene = useAtmosphereStore((s) => s.scene);
  const finalScene = useAtmosphereStore((s) => s.finalScene);
  const isDraggingJoint = useAtmosphereStore((s) => s.isDraggingJoint);

  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [0, 1.6, 7.6], fov: 45 }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <ViewportBridge />
        <PlaybackDriver />
        <CentroidLock />
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
        {scene && finalScene && (
          <>
            <primitive object={scene} />
            <primitive object={finalScene} />
          </>
        )}
        {scene && <JointHandles scene={scene} />}
        {finalScene && <JointHandles scene={finalScene} />}
        {/* Camera orbit stays free; only an active joint drag suspends it,
            so the two gestures (pose a joint vs. look around) never fight. */}
        <OrbitControls makeDefault enabled={!isDraggingJoint} target={[0, 1, 0]} />
      </Canvas>
      {!scene && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="bg-background px-4 py-2 font-mono text-xs uppercase tracking-widest text-foreground/50">
            Upload a rigged .glb or .gltf model to begin
          </p>
        </div>
      )}
    </div>
  );
}
