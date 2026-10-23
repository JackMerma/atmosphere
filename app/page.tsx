"use client";

import ModelUpload from "@/components/ModelUpload";
import RigViewport from "@/components/RigViewport";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export default function Home() {
  const joints = useAtmosphereStore((s) => s.joints);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-50 p-8">
      <h1 className="text-2xl font-bold uppercase tracking-tight">Atmosphere</h1>
      <ModelUpload />
      <RigViewport />
      {joints.length > 0 && (
        <p className="text-sm text-black/60">
          Mapped {joints.length} joint{joints.length === 1 ? "" : "s"}.
        </p>
      )}
    </main>
  );
}
