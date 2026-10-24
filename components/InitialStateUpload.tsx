"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { estimatePose } from "@/lib/poseEstimation";
import { poseModelFrom } from "@/lib/initialPose";
import { collectBones } from "@/lib/boneMath";
import { resetToRest, snapshotPose } from "@/lib/convergence";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const buttonClass =
  "btn inline-flex items-center justify-center px-4 py-2 font-mono text-xs uppercase tracking-widest";

const q = new THREE.Quaternion();
const base = new THREE.Quaternion();

/** True when any bone's rotation differs from `baseline` (quaternion sign ignored). */
function poseDiffers(bones: THREE.Bone[], baseline: number[][]) {
  return bones.some((bone, i) => {
    q.copy(bone.quaternion);
    base.fromArray(baseline[i]);
    return 1 - Math.abs(q.dot(base)) > 1e-6;
  });
}

/**
 * Photo of a person -> pose estimation -> model posed to match, saved as the
 * initial state Motion starts from. "Define Initial State" saves the current
 * pose instead, and is only available once the pose has moved off the saved one.
 */
export default function InitialStateUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const scene = useAtmosphereStore((s) => s.scene);
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);
  const busyElsewhere = useAtmosphereStore((s) => s.generating || s.playing);
  const initialState = useAtmosphereStore((s) => s.initialState);
  const initialStateName = useAtmosphereStore((s) => s.initialStateName);
  const setInitialState = useAtmosphereStore((s) => s.setInitialState);
  const setPoseReference = useAtmosphereStore((s) => s.setPoseReference);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);

  const bones = useMemo(() => (scene ? collectBones(scene) : []), [scene]);

  // Joints are dragged imperatively (no store update), so watch the bones for changes.
  useEffect(() => {
    if (bones.length === 0) return;
    const id = setInterval(() => {
      const baseline =
        initialState ?? bones.map((b) => b.userData.restQuaternion as number[]);
      setMoved(poseDiffers(bones, baseline));
    }, 150);
    return () => clearInterval(id);
  }, [bones, initialState]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { viewport } = useAtmosphereStore.getState();
    if (!scene || !viewport) return;

    setBusy(true);
    setError(null);
    try {
      const { world, image, size } = await estimatePose(file);
      poseModelFrom(world);
      setInitialState(snapshotPose(bones), file.name);
      setPoseReference({
        url: URL.createObjectURL(file),
        name: file.name,
        landmarks: image,
        world,
        size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the pose from this image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function define() {
    setInitialState(snapshotPose(bones), "Manual pose");
    setMoved(false);
  }

  function clear() {
    resetToRest(bones);
    setInitialState(null);
    setPoseReference(null);
  }

  const uploadDisabled = !hasJoints || busy || busyElsewhere;
  const defineDisabled = !hasJoints || busy || busyElsewhere || !moved;

  return (
    <div className="flex flex-col gap-2">
      <label
        className={buttonClass}
        data-disabled={uploadDisabled}
      >
        {busy ? "Estimating pose…" : "Upload Initial State"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={uploadDisabled}
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      <button
        type="button"
        onClick={define}
        disabled={defineDisabled}
        className={buttonClass}
      >
        Define Initial State
      </button>
      {error && (
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{error}</p>
      )}
      {initialStateName && !error && (
        <p className="flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-widest text-foreground/50">
          <span className="truncate">{initialStateName}</span>
          <button
            type="button"
            onClick={clear}
            disabled={busyElsewhere}
            className="shrink-0 hover:text-accent disabled:opacity-40"
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
