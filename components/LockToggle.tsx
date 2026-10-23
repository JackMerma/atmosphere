"use client";

import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export default function LockToggle() {
  const locked = useAtmosphereStore((s) => s.locked);
  const toggleLock = useAtmosphereStore((s) => s.toggleLock);
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);

  return (
    <button
      type="button"
      disabled={!hasJoints}
      onClick={toggleLock}
      className="inline-flex items-center justify-center border border-black/90 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      Lock: {locked ? "On" : "Off"}
    </button>
  );
}
