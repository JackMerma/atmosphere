import { collectBones } from "@/lib/boneMath";
import { resetToRest } from "@/lib/convergence";
import { applyPoseToRig } from "@/lib/poseRetarget";
import type { PoseLandmark } from "@/lib/poseEstimation";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/** Resets the loaded model to rest, then poses it to match the given world landmarks. */
export function poseModelFrom(world: PoseLandmark[]) {
  const { scene, viewport } = useAtmosphereStore.getState();
  if (!scene || !viewport) return;
  const bones = collectBones(scene);
  resetToRest(bones);
  applyPoseToRig(bones, world, viewport.camera);
}
