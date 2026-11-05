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
      {/* Grows with its content and only scrolls when it would otherwise
          collide with something: its height is capped at the viewport minus
          its own margins minus the debug filmstrip, whose height
          `DebugFilmstrip` publishes as `--filmstrip-h` (0 while it is absent).
          The scroller is the inner div, so the corner brackets on this box
          are never clipped. `pr-3 -mr-3` moves its scrollbar 12px out into
          the box's own padding, leaving a gap between it and the controls
          while the content keeps its full width when nothing scrolls. */}
      <div className="fixed right-6 top-6 z-10 flex max-h-[calc(100dvh-3rem-var(--filmstrip-h,0px))] w-80 flex-col border border-hairline bg-background p-4">
        <CornerBrackets />
        <div className="-mr-3 flex min-h-0 flex-col gap-3 overflow-y-auto pr-3">
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
