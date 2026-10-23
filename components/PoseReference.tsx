"use client";

import CornerBrackets from "@/components/CornerBrackets";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/** MediaPipe landmark pairs that form the drawn skeleton. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32],
];
/** Nose plus shoulders, elbows, wrists, hips, knees, ankles and toes. */
const DOTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32];
const MIN_VISIBILITY = 0.4;

/** Bottom-left thumbnail of the uploaded photo with the detected pose drawn on it. */
export default function PoseReference() {
  const reference = useAtmosphereStore((s) => s.poseReference);
  if (!reference) return null;

  const { url, name, landmarks } = reference;
  const visible = (i: number) => landmarks[i]?.visibility >= MIN_VISIBILITY;

  return (
    <div className="fixed bottom-6 left-6 z-10 border border-hairline bg-background p-2">
      <CornerBrackets />
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={url} alt={`Pose reference: ${name}`} className="block max-h-64 max-w-64" />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {BONES.filter(([a, b]) => visible(a) && visible(b)).map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={landmarks[a].x}
              y1={landmarks[a].y}
              x2={landmarks[b].x}
              y2={landmarks[b].y}
              stroke="#fa3600"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {DOTS.filter(visible).map((i) => (
          <span
            key={i}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-accent"
            style={{ left: `${landmarks[i].x * 100}%`, top: `${landmarks[i].y * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1 max-w-64 truncate font-mono text-xs uppercase tracking-widest text-foreground/50">
        {name}
      </p>
    </div>
  );
}
