"use client";

import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export default function AnimationsHistoryPanel() {
  const animations = useAtmosphereStore((s) => s.animations);
  const activeId = useAtmosphereStore((s) => s.activeAnimationId);
  const setActive = useAtmosphereStore((s) => s.setActiveAnimation);

  if (animations.length === 0) return null;

  return (
    <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
      {animations.map((animation) => (
        <li key={animation.id}>
          <button
            type="button"
            onClick={() => setActive(animation.id)}
            className={`w-full border px-3 py-1.5 text-left font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent ${
              animation.id === activeId
                ? "border-accent text-accent"
                : "border-hairline text-foreground"
            }`}
          >
            {animation.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
