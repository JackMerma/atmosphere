"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Bounds } from "@react-three/drei";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import JointHandles from "@/components/JointHandles";

export default function RigViewport() {
  const scene = useAtmosphereStore((s) => s.scene);
  const locked = useAtmosphereStore((s) => s.locked);
  const setSelectedJoint = useAtmosphereStore((s) => s.setSelectedJoint);

  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [2, 1.6, 3], fov: 45 }}
        onPointerMissed={() => setSelectedJoint(null)}
      >
        <color attach="background" args={["#161513"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 3]} intensity={1.2} />
        <Grid
          args={[40, 40]}
          position={[0, 0, 0]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#3a3733"
          sectionSize={2.5}
          sectionThickness={1}
          sectionColor="#55504a"
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
        <OrbitControls makeDefault enabled={!locked} />
      </Canvas>
      {!scene && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-white/40">
          Upload a rigged model to see it here
        </p>
      )}
    </div>
  );
}
