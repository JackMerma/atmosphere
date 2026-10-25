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

/**
 * Hidden for this version: the whole initial/final workflow (the toggle, the
 * state panels, the magnet transition) stays in place, unused, rather than
 * removed. `dualState` defaults to false and nothing else can set it true
 * without this checkbox, so leaving it unmounted is enough to hide all of it
 * -- `StateColumn` below is already gated on `dualState`.
 */
const SHOW_DUAL_STATE_TOGGLE = false;

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
      {/* max-h clears the collapsed debug filmstrip's header (fixed to the
          bottom edge) with room to spare; overflow-y-auto means a scrollbar
          only appears once a tall panel (many sliders, a long animation list)
          actually reaches that limit, never before. overflow-x-hidden is
          required alongside it, not redundant: per the CSS spec, setting only
          overflow-y makes overflow-x compute to `auto` too, so without this a
          single pixel of rounding on any child is enough to show a horizontal
          scrollbar that was never wanted -- the panel's own width is fixed and
          every child is built to fit inside it. */}
      <div className="fixed right-6 top-6 z-10 max-h-[calc(100vh-5.5rem)] w-80 overflow-y-auto overflow-x-hidden border border-hairline bg-background p-4">
        <CornerBrackets />
        <div className="flex flex-col gap-3">
          <ModelUpload />
          {SHOW_DUAL_STATE_TOGGLE && <DualStateToggle />}
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
