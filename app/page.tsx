"use client";

import { useEffect, useState } from "react";
import ModelUpload from "@/components/ModelUpload";
import MotionModal from "@/components/MotionModal";
import RigViewport from "@/components/RigViewport";
import CornerBrackets from "@/components/CornerBrackets";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { parseGltfBuffer } from "@/lib/gltfJoints";
import { loadModel } from "@/lib/db";

export default function Home() {
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);
  const [motionOpen, setMotionOpen] = useState(false);
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
    <div className="min-h-screen">
      <RigViewport />
      <div className="fixed right-6 top-6 z-10 w-80 border border-hairline bg-background p-4">
        <CornerBrackets />
        <div className="flex flex-col gap-3">
          <ModelUpload />
          <button
            type="button"
            disabled={!hasJoints}
            onClick={() => setMotionOpen(true)}
            className="border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-foreground"
          >
            Motion
          </button>
        </div>
      </div>
      {motionOpen && <MotionModal onClose={() => setMotionOpen(false)} />}
    </div>
  );
}
