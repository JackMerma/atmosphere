"use client";

import { useEffect } from "react";
import ModelUpload from "@/components/ModelUpload";
import DualStateToggle from "@/components/DualStateToggle";
import MotionSection from "@/components/MotionSection";
import PhysicsSection from "@/components/PhysicsSection";
import StateColumn from "@/components/StateColumn";
import RigViewport from "@/components/RigViewport";
import CornerBrackets from "@/components/CornerBrackets";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { parseModelPair } from "@/lib/gltfJoints";
import { loadModel, loadAnimations } from "@/lib/db";
import AnimationsHistoryPanel from "@/components/AnimationsHistoryPanel";
import PlayButton from "@/components/PlayButton";
import Toaster from "@/components/Toaster";
import DebugFilmstrip from "@/components/DebugFilmstrip";

export default function Home() {
  const setLoading = useAtmosphereStore((s) => s.setLoading);
  const setModel = useAtmosphereStore((s) => s.setModel);
  const setError = useAtmosphereStore((s) => s.setError);
  const setAnimations = useAtmosphereStore((s) => s.setAnimations);
  const dualState = useAtmosphereStore((s) => s.dualState);

  useEffect(() => {
    (async () => {
      const stored = await loadModel();
      if (!stored) return;
      setAnimations(await loadAnimations());
      setLoading();
      try {
        const buffer = await stored.fileBlob.arrayBuffer();
        const parsed = await parseModelPair(buffer, stored.fileName);
        setModel(parsed.scene, parsed.finalScene, parsed.joints, stored.fileName);
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
          <DualStateToggle />
          <PhysicsSection />
          <MotionSection />
          <AnimationsHistoryPanel />
          <PlayButton />
        </div>
      </div>
      <Toaster />
      {dualState && (
        <>
          <StateColumn side="initial" />
          <StateColumn side="final" />
        </>
      )}
      <DebugFilmstrip />
    </div>
  );
}
