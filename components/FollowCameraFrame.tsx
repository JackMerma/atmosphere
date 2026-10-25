"use client";

import { useEffect, useState } from "react";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { followViewRect } from "@/lib/followViewLayout";

/**
 * The border around the follow-camera mini-view. The picture inside it is
 * drawn straight into the WebGL canvas by `FollowCameraView`, which this
 * knows nothing about -- this is just a plain, non-interactive rectangle of
 * HTML positioned over the exact same rect, so the live render reads as a
 * picture-in-picture rather than an unframed patch of the scene. Shown only
 * while playing, same as the view underneath it.
 */
export default function FollowCameraFrame() {
  const playing = useAtmosphereStore((s) => s.playing);
  const [rect, setRect] = useState<{ left: number; top: number; size: number } | null>(null);

  useEffect(() => {
    if (!playing) return;
    const update = () => setRect(followViewRect());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [playing]);

  if (!playing || !rect) return null;

  return (
    <div
      className="pointer-events-none fixed z-10 border border-hairline"
      style={{ left: rect.left, top: rect.top, width: rect.size, height: rect.size }}
    />
  );
}
