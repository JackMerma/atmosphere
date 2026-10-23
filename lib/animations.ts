import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { saveAnimation } from "@/lib/db";
import type { Keyframe } from "@/lib/convergence";

export interface Animation {
  id: string;
  /** 1-based, never reused, so labels stay unique across regenerations. */
  index: number;
  label: string;
  createdAt: number;
  keyframes: Keyframe[];
}

/** Records a finished generation as a new history entry and makes it the active one. */
export async function createAnimation(keyframes: Keyframe[]) {
  const { animations, addAnimation } = useAtmosphereStore.getState();
  const index = animations.reduce((max, a) => Math.max(max, a.index), 0) + 1;
  const animation: Animation = {
    id: crypto.randomUUID(),
    index,
    label: `Animation ${index}`,
    createdAt: Date.now(),
    keyframes,
  };
  addAnimation(animation);
  await saveAnimation(animation);
  return animation;
}
