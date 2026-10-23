"use client";

import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import CornerBrackets from "@/components/CornerBrackets";

export default function LockToggle() {
  const locked = useAtmosphereStore((s) => s.locked);
  const toggleLock = useAtmosphereStore((s) => s.toggleLock);
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);

  return (
    <div className="relative inline-block w-fit">
      <button
        type="button"
        disabled={!hasJoints}
        onClick={toggleLock}
        className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-foreground"
      >
        Lock: {locked ? "On" : "Off"}
      </button>
      <CornerBrackets />
    </div>
  );
}
