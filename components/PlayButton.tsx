"use client";

import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export default function PlayButton() {
  const playing = useAtmosphereStore((s) => s.playing);
  const setPlaying = useAtmosphereStore((s) => s.setPlaying);
  const generating = useAtmosphereStore((s) => s.generating);
  const hasActive = useAtmosphereStore((s) => s.activeAnimationId !== null);

  return (
    <button
      type="button"
      disabled={!hasActive || generating}
      onClick={() => setPlaying(!playing)}
      className="btn px-4 py-2 font-mono text-xs uppercase tracking-widest"
    >
      {playing ? "Stop" : "Play"}
    </button>
  );
}
