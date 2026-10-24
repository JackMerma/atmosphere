import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { saveAnimation } from "@/lib/db";
import type { Ease } from "@/lib/easing";
import type { PoseQuats } from "@/lib/pose";

export interface Keyframe {
  /** What this pose is; for the first and last keyframe, the state they came from. */
  pose: string;
  /** Jev's match score for this pose (0..1), when it was judged. */
  match: number | null;
  converged: boolean;
  quats: PoseQuats;
  /** Seconds from the start. Absent on animations saved by the older pipeline. */
  time?: number;
  /** Easing on the way INTO this keyframe. */
  ease?: Ease;
}

export interface Animation {
  id: string;
  /** 1-based, never reused, so labels stay unique across regenerations. */
  index: number;
  label: string;
  createdAt: number;
  keyframes: Keyframe[];
  /** Older pipeline only: the pose the animation began from, absent = rest. */
  start?: PoseQuats;
  /** Seconds from the first to the last keyframe; present on timeline animations. */
  duration?: number;
}

/** Records a finished generation as a new history entry and makes it the active one. */
export async function createAnimation(keyframes: Keyframe[], duration: number) {
  const { animations, addAnimation } = useAtmosphereStore.getState();
  const index = animations.reduce((max, a) => Math.max(max, a.index), 0) + 1;
  const animation: Animation = {
    id: crypto.randomUUID(),
    index,
    label: `Animation ${index}`,
    createdAt: Date.now(),
    keyframes,
    duration,
  };
  addAnimation(animation);
  await saveAnimation(animation);
  return animation;
}
