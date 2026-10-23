"use client";

import { useEffect } from "react";
import ModelUpload from "@/components/ModelUpload";
import RigViewport from "@/components/RigViewport";
import LockToggle from "@/components/LockToggle";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { parseGltfBuffer } from "@/lib/gltfJoints";
import { loadModel } from "@/lib/db";

export default function Home() {
  const joints = useAtmosphereStore((s) => s.joints);
  const setLoading = useAtmosphereStore((s) => s.setLoading);
  const setModel = useAtmosphereStore((s) => s.setModel);
  const setError = useAtmosphereStore((s) => s.setError);

  useEffect(() => {
    (async () => {
      const stored = await loadModel();
      if (!stored) return;
      setLoading();
      try {
        const buffer = await stored.fileBlob.arrayBuffer();
        const parsed = await parseGltfBuffer(buffer);
        setModel(parsed.scene, parsed.joints, stored.fileName);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not restore the saved model."
        );
      }
    })();
    // Runs once on mount to restore any previously uploaded model.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-50 p-8">
      <h1 className="text-2xl font-bold uppercase tracking-tight">Atmosphere</h1>
      <ModelUpload />
      <RigViewport />
      <LockToggle />
      {joints.length > 0 && (
        <p className="text-sm text-black/60">
          Mapped {joints.length} joint{joints.length === 1 ? "" : "s"}.
        </p>
      )}
    </main>
  );
}
