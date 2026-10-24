import { bonesOf, resetToRest } from "@/lib/pose";
import { applyPoseToRig } from "@/lib/poseRetarget";
import type { PoseLandmark } from "@/lib/poseEstimation";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

/** Resets one side's model to rest, then poses it to match the given world landmarks. */
export function poseModelFrom(world: PoseLandmark[], side: Side) {
  const { viewport } = useAtmosphereStore.getState();
  const bones = bonesOf(side);
  if (!viewport || bones.length === 0) return;
  resetToRest(bones);
  applyPoseToRig(bones, world, viewport.camera);
}
