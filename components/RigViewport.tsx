"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import JointHandles from "@/components/JointHandles";
import CornerBrackets from "@/components/CornerBrackets";

export default function RigViewport() {
  const scene = useAtmosphereStore((s) => s.scene);
  const locked = useAtmosphereStore((s) => s.locked);

  return (
    <div className="relative h-[480px] w-full border border-hairline">
      <Canvas camera={{ position: [0, 1.4, 3], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 3]} intensity={1.2} />
        {scene && <primitive object={scene} />}
        <JointHandles />
        <OrbitControls target={[0, 1, 0]} enabled={!locked} />
      </Canvas>
      {!scene && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-widest text-foreground/40">
          Upload a rigged model to see it here
        </p>
      )}
      <CornerBrackets />
    </div>
  );
}
