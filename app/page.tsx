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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-hairline px-8 py-5">
        <h1 className="font-display text-2xl uppercase tracking-[-0.02em]">
          Atmosphere
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-widest text-foreground/50">
          Atmosphere anything
        </p>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
        <ModelUpload />
        <RigViewport />
        <LockToggle />
        {joints.length > 0 && (
          <p className="font-mono text-xs uppercase tracking-widest text-foreground/50">
            Mapped {joints.length} joint{joints.length === 1 ? "" : "s"}
          </p>
        )}
      </main>
    </div>
  );
}
