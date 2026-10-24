"use client";

import { useRef, useState } from "react";
import CornerBrackets from "@/components/CornerBrackets";
import { poseModelFrom } from "@/lib/initialPose";
import { useAtmosphereStore, type PoseReference as Reference } from "@/store/useAtmosphereStore";

/** MediaPipe landmark pairs that form the drawn skeleton. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32],
];
/** Nose plus shoulders, elbows, wrists, hips, knees, ankles and toes. */
const DOTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
const MIN_VISIBILITY = 0.4;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** World metres per image pixel, from how long the visible bones are in both spaces. */
function metresPerPixel(ref: Reference) {
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

/**
 * Bottom-left thumbnail of the uploaded photo with the detected pose drawn on it.
 * Dragging a dot moves that landmark and re-poses the model from the edited set.
 */
export default function PoseReference() {
  const reference = useAtmosphereStore((s) => s.poseReference);
  const locked = useAtmosphereStore((s) => s.generating || s.playing);
  const setPoseReference = useAtmosphereStore((s) => s.setPoseReference);
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  if (!reference) return null;

  const { url, name, landmarks } = reference;
  /** Low-confidence landmarks are still shown (and draggable), just dimmed. */
  const unsure = (i: number) => landmarks[i].visibility < MIN_VISIBILITY;

  function move(e: React.PointerEvent, i: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    const current = useAtmosphereStore.getState().poseReference;
    if (dragging !== i || !rect || !current) return;

    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    const before = current.landmarks[i];
    const k = metresPerPixel(current);

    // Image x/y map to world x/y by the photo's scale; depth (z) is left as estimated.
    const nextLandmarks = current.landmarks.slice();
    nextLandmarks[i] = { ...before, x, y, visibility: 1 }; // placed by hand: now trusted
    const nextWorld = current.world.slice();
    nextWorld[i] = {
      ...current.world[i],
      x: current.world[i].x + (x - before.x) * current.size.width * k,
      y: current.world[i].y + (y - before.y) * current.size.height * k,
    };

    setPoseReference({ ...current, landmarks: nextLandmarks, world: nextWorld });
    poseModelFrom(nextWorld);
  }

  return (
    <div className="fixed bottom-6 left-6 z-10 border border-hairline bg-background p-2">
      <CornerBrackets />
      <div ref={frameRef} className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img
          src={url}
          alt={`Pose reference: ${name}`}
          draggable={false}
          className="block max-h-[22rem] max-w-[22rem] select-none"
        />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {BONES.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={landmarks[a].x}
              y1={landmarks[a].y}
              x2={landmarks[b].x}
              y2={landmarks[b].y}
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
            onPointerMove={(e) => move(e, i)}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
            className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border border-white ${
              dragging === i ? "bg-[#0090ff]" : "bg-accent"
            } ${unsure(i) ? "opacity-60" : ""} ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}
            style={{ left: `${landmarks[i].x * 100}%`, top: `${landmarks[i].y * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1 max-w-[22rem] truncate font-mono text-xs uppercase tracking-widest text-foreground/50">
        {name}
      </p>
    </div>
  );
}
