"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import CornerBrackets from "@/components/CornerBrackets";
import { estimatePose } from "@/lib/poseEstimation";
import { poseModelFrom } from "@/lib/initialPose";
import { bonesOf, resetToRest, restQuats, snapshotPose } from "@/lib/pose";
import { useAtmosphereStore, type PoseReference, type Side } from "@/store/useAtmosphereStore";
import { toast } from "@/store/useToasts";

const buttonClass =
  "btn inline-flex items-center justify-center px-3 py-2 font-mono text-xs uppercase tracking-widest";

const TITLE: Record<Side, string> = { initial: "Initial state", final: "Final state" };
const FALLBACK_NAME = "Manual pose";

/** MediaPipe landmark pairs that form the drawn skeleton. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32],
];
/** Nose plus shoulders, elbows, wrists, hips, knees, ankles and toes. */
const DOTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
const MIN_VISIBILITY = 0.4;

const q = new THREE.Quaternion();
const base = new THREE.Quaternion();
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** True when any bone's rotation differs from `baseline` (quaternion sign ignored). */
function poseDiffers(bones: THREE.Bone[], baseline: number[][]) {
  return bones.some((bone, i) => {
    q.copy(bone.quaternion);
    base.fromArray(baseline[i]);
    return 1 - Math.abs(q.dot(base)) > 1e-6;
  });
}

/** World metres per image pixel, from how long the trusted bones are in both spaces. */
function metresPerPixel(ref: PoseReference) {
  let world = 0;
  let pixels = 0;
  for (const [a, b] of BONES) {
    const la = ref.landmarks[a];
    const lb = ref.landmarks[b];
    if (la.visibility < MIN_VISIBILITY || lb.visibility < MIN_VISIBILITY) continue;
    const wa = ref.world[a];
    const wb = ref.world[b];
    world += Math.hypot(wa.x - wb.x, wa.y - wb.y);
    pixels += Math.hypot((la.x - lb.x) * ref.size.width, (la.y - lb.y) * ref.size.height);
  }
  return pixels > 0 ? world / pixels : 0;
}

/** Longest side, in pixels, of a reference photo sent to Jev; it rejects images outside its size range. */
/**
 * One column's floating controls, under its model: upload a photo to pose the
 * model from it (with draggable landmarks to correct the estimate), or define
 * the model's current pose by hand. "Define" is only available once the pose
 * has moved off the saved one. "Refine with Jev" nudges a photo-posed model
 * until it looks more like the photo.
 */
export default function StateColumn({ side }: { side: Side }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scene = useAtmosphereStore((s) => (side === "initial" ? s.scene : s.finalScene));
  const slot = useAtmosphereStore((s) => s.slots[side]);
  const setSlot = useAtmosphereStore((s) => s.setSlot);
  const busyElsewhere = useAtmosphereStore((s) => s.generating || s.playing);
  const hidden = useAtmosphereStore((s) => s.playing || s.merged);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  const bones = useMemo(() => bonesOf(side), [scene, side]); // eslint-disable-line react-hooks/exhaustive-deps

  // Joints are dragged imperatively (no store update), so watch the bones for changes.
  useEffect(() => {
    if (bones.length === 0) return;
    const id = setInterval(() => {
      setMoved(poseDiffers(bones, slot.quats ?? restQuats(bones)));
    }, 150);
    return () => clearInterval(id);
  }, [bones, slot.quats]);

  if (!scene) return null;
  const locked = busy || busyElsewhere;
  const reference = slot.reference;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Estimating pose…");
    try {
      const { world, image, size } = await estimatePose(file);
      poseModelFrom(world, side);
      setSlot(side, {
        quats: snapshotPose(bones),
        name: file.name,
        reference: { url: URL.createObjectURL(file), name: file.name, landmarks: image, world, size },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the pose from this image.");
    } finally {
      setBusy(false);
      setStatus(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function define() {
    setSlot(side, { quats: snapshotPose(bones), name: FALLBACK_NAME });
    setMoved(false);
  }

  function clear() {
    resetToRest(bones);
    setSlot(side, { quats: null, name: null, reference: null });
  }


  /** Drag a landmark: move it in the photo, then re-pose the model from the edited set. */
  function moveLandmark(e: React.PointerEvent, i: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    const current = useAtmosphereStore.getState().slots[side].reference;
    if (dragging !== i || !rect || !current) return;

    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    const before = current.landmarks[i];
    const k = metresPerPixel(current);

    // Image x/y map to world x/y by the photo's scale; depth (z) is left as estimated.
    const landmarks = current.landmarks.slice();
    landmarks[i] = { ...before, x, y, visibility: 1 }; // placed by hand: now trusted
    const world = current.world.slice();
    world[i] = {
      ...current.world[i],
      x: current.world[i].x + (x - before.x) * current.size.width * k,
      y: current.world[i].y + (y - before.y) * current.size.height * k,
    };
    setSlot(side, { reference: { ...current, landmarks, world } });
    poseModelFrom(world, side);
  }

  const unsure = (i: number) => (reference?.landmarks[i]?.visibility ?? 1) < MIN_VISIBILITY;

  return (
    <div
      // Slides out of the way while an animation plays, and back when it stops.
      className={`fixed bottom-6 z-10 flex w-64 -translate-x-1/2 flex-col gap-2 border border-hairline bg-background p-3 transition-[opacity,transform] duration-500 ease-out ${
        side === "initial" ? "left-[26%]" : "left-[74%]"
      } ${hidden ? "pointer-events-none translate-y-[130%] opacity-0" : "translate-y-0 opacity-100"}`}
    >
      <CornerBrackets />
      <p className="font-headline text-sm uppercase tracking-[-0.02em]">{TITLE[side]}</p>

      {reference && (
        <div ref={frameRef} className="relative self-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img
            src={reference.url}
            alt={`Pose reference: ${reference.name}`}
            draggable={false}
            className="block max-h-40 max-w-40 select-none"
          />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {BONES.map(([a, b]) => (
              <line
                key={`${a}-${b}`}
                x1={reference.landmarks[a].x}
                y1={reference.landmarks[a].y}
                x2={reference.landmarks[b].x}
                y2={reference.landmarks[b].y}
                stroke="#fa3600"
                strokeWidth={2}
                strokeDasharray={unsure(a) || unsure(b) ? "4 3" : undefined}
                opacity={unsure(a) || unsure(b) ? 0.55 : 1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {DOTS.map((i) => (
            <span
              key={i}
              onPointerDown={(e) => {
                if (locked) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(i);
              }}
              onPointerMove={(e) => moveLandmark(e, i)}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
              className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-white ${
                dragging === i ? "bg-[#0090ff]" : "bg-accent"
              } ${unsure(i) ? "opacity-60" : ""} ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
              style={{
                left: `${reference.landmarks[i].x * 100}%`,
                top: `${reference.landmarks[i].y * 100}%`,
              }}
            />
          ))}
        </div>
      )}

      <label className={buttonClass} data-disabled={locked}>
        Upload {side === "initial" ? "Initial" : "Final"} State
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={locked}
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      <button
        type="button"
        onClick={define}
        disabled={locked || !moved}
        className={buttonClass}
      >
        Define {side === "initial" ? "Initial" : "Final"} State
      </button>
      {status && (
        <p className="font-mono text-xs uppercase tracking-widest text-foreground/70">{status}</p>
      )}
      {slot.name && !status && (
        <p className="flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-widest text-foreground/50">
          <span className="truncate">{slot.name}</span>
          <button
            type="button"
            onClick={clear}
            disabled={locked}
            className="shrink-0 hover:text-accent disabled:opacity-40"
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
