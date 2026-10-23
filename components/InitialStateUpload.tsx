"use client";

import { useRef, useState } from "react";
import { estimatePose } from "@/lib/poseEstimation";
import { applyPoseToRig } from "@/lib/poseRetarget";
import { collectBones } from "@/lib/boneMath";
import { resetToRest, snapshotPose } from "@/lib/convergence";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const buttonClass =
  "inline-flex items-center justify-center border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent";

/** Photo of a person -> pose estimation -> model posed to match; Motion starts from it. */
export default function InitialStateUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);
  const generating = useAtmosphereStore((s) => s.generating);
  const initialStateName = useAtmosphereStore((s) => s.initialStateName);
  const setInitialState = useAtmosphereStore((s) => s.setInitialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { scene, viewport } = useAtmosphereStore.getState();
    if (!scene || !viewport) return;

    setBusy(true);
    setError(null);
    try {
      const landmarks = await estimatePose(file);
      const bones = collectBones(scene);
      resetToRest(bones);
      applyPoseToRig(bones, landmarks, viewport.camera);
      setInitialState(snapshotPose(bones), file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the pose from this image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    const { scene } = useAtmosphereStore.getState();
    if (scene) resetToRest(collectBones(scene));
    setInitialState(null);
  }

  const disabled = !hasJoints || busy || generating;

  return (
    <div className="flex flex-col gap-2">
      <label
        className={`${buttonClass} ${disabled ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
      >
        {busy ? "Estimating pose…" : "Upload Initial State"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={disabled}
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      {error && (
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{error}</p>
      )}
      {initialStateName && !error && (
        <p className="flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-widest text-foreground/50">
          <span className="truncate">{initialStateName}</span>
          <button
            type="button"
            onClick={clear}
            disabled={generating}
            className="shrink-0 hover:text-accent disabled:opacity-40"
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
