"use client";

import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/**
 * Switches between the two ways a generation gets its start and end.
 *
 * Off (default): one model on stage, nothing pinned, the planner authors every
 * pose from the prompt alone. On: both stage copies show with their labels and
 * the magnet transition, and either can be posed by hand or from a photo and
 * pinned as where the animation starts or ends.
 */
export default function DualStateToggle() {
  const dualState = useAtmosphereStore((s) => s.dualState);
  const setDualState = useAtmosphereStore((s) => s.setDualState);

  return (
    <label className="flex items-center gap-2 border border-hairline px-3 py-2 font-mono text-xs uppercase tracking-widest">
      <input
        type="checkbox"
        checked={dualState}
        onChange={(e) => setDualState(e.target.checked)}
        className="accent-accent"
      />
      Pin initial / final state
    </label>
  );
}
