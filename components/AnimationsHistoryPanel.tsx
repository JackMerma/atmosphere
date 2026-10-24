"use client";

import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { clearAnimations, deleteAnimation } from "@/lib/db";

export default function AnimationsHistoryPanel() {
  const animations = useAtmosphereStore((s) => s.animations);
  const activeId = useAtmosphereStore((s) => s.activeAnimationId);
  const setActive = useAtmosphereStore((s) => s.setActiveAnimation);
  const removeAnimation = useAtmosphereStore((s) => s.removeAnimation);
  const setAnimations = useAtmosphereStore((s) => s.setAnimations);

  if (animations.length === 0) return null;

  async function remove(id: string) {
    removeAnimation(id);
    await deleteAnimation(id);
  }

  async function removeAll() {
    setAnimations([]);
    await clearAnimations();
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto p-1">
        {animations.map((animation) => (
          <li key={animation.id} className="flex gap-1">
            <button
              type="button"
              onClick={() => setActive(animation.id)}
              data-active={animation.id === activeId}
              className="btn min-w-0 flex-1 px-3 py-1.5 text-left font-mono text-xs uppercase tracking-widest"
            >
              {animation.label}
            </button>
            <button
              type="button"
              onClick={() => remove(animation.id)}
              aria-label={`Delete ${animation.label}`}
              title={`Delete ${animation.label}`}
              className="btn px-2.5 py-1.5 font-mono text-xs leading-none"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {animations.length > 1 && (
        <button
          type="button"
          onClick={removeAll}
          className="self-end font-mono text-xs uppercase tracking-widest text-foreground/50 transition-colors hover:text-accent"
        >
          Delete all
        </button>
      )}
    </div>
  );
}
