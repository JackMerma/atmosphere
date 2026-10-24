import { applySegmentsToRig, measureSegments } from "@/lib/poseRetarget";
import { bonesOf, poseDistance, restorePose, slotQuats } from "@/lib/pose";
import { refinePose, type MotionSettings } from "@/lib/refine";
import type { Keyframe } from "@/lib/animations";
import type { MotionPlan } from "@/lib/plannerClient";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/** Length of an animation with no prompt: straight from the initial to the final state. */
const DEFAULT_DURATION = 2;
/** Below this many degrees the two states count as the same pose. */
const SAME_POSE_DEGREES = 2;

export interface Progress {
  phase: "planning" | "refining";
  /** Which beat is being judged, 1-based, and how many there are. */
  keyframe: number;
  keyframeCount: number;
  round: number;
  rounds: number;
  match: number | null;
  text: string;
}

export interface Generated {
  keyframes: Keyframe[];
  duration: number;
  /** Beats the planner directed between the two states. */
  beats: number;
}

async function requestPlan(prompt: string, start: unknown, end: unknown): Promise<MotionPlan> {
  const res = await fetch("/api/motion/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, start, end }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not plan the motion.");
  return data as MotionPlan;
}

/**
 * Builds an animation from the initial state to the final state.
 *
 * With no prompt it is a direct, eased blend between the two poses. With a
 * prompt, the planner directs it: the duration, the intermediate beats, each beat's
 * easing and hold. Every directed beat is first posed exactly from the planner's
 * vectors, then refined by Jev with parallel candidates against its
 * description. The in-between frames are interpolated at playback, within the
 * joint limits. The stage model is left in its initial pose, and on any
 * failure nothing is returned, so no partial animation can be saved.
 */
export async function generateAnimation(
  prompt: string,
  settings: MotionSettings,
  onProgress: (p: Progress) => void
): Promise<Generated> {
  const { scene, viewport, slots } = useAtmosphereStore.getState();
  if (!scene || !viewport) throw new Error("Load a model first.");

  const bones = bonesOf("initial");
  const startQuats = slotQuats("initial", bones);
  const endQuats = slotQuats("final", bones);
  const directing = prompt.trim().length > 0;

  if (!directing && poseDistance(startQuats, endQuats) < SAME_POSE_DEGREES) {
    throw new Error("The initial and final states are the same: change one, or describe a motion.");
  }

  const startName = slots.initial.name ?? "Initial state";
  const endName = slots.final.name ?? "Final state";

  try {
    let plan: MotionPlan = { duration: DEFAULT_DURATION, keyframes: [] };

    if (directing) {
      onProgress({
        phase: "planning",
        keyframe: 0,
        keyframeCount: 0,
        round: 0,
        rounds: 0,
        match: null,
        text: "Directing the motion…",
      });
      let start, end;
      try {
        restorePose(bones, startQuats);
        start = measureSegments(bones, viewport.camera);
        restorePose(bones, endQuats);
        end = measureSegments(bones, viewport.camera);
      } catch {
        throw new Error(
          "Directing a motion needs a humanoid skeleton (arms and legs named like Mixamo). " +
            "Clear the prompt to blend the two states directly."
        );
      }
      plan = await requestPlan(prompt, start, end);
    }

    const keyframes: Keyframe[] = [
      { pose: startName, match: null, converged: true, quats: startQuats, time: 0, ease: "inOut" },
    ];
    let holds = 0;

    for (let i = 0; i < plan.keyframes.length; i++) {
      const beat = plan.keyframes[i];
      restorePose(bones, startQuats);
      applySegmentsToRig(bones, beat.segments, viewport.camera);

      const refined = await refinePose({
        side: "initial",
        target: { text: beat.text },
        settings,
        onProgress: (p) =>
          onProgress({
            phase: "refining",
            keyframe: i + 1,
            keyframeCount: plan.keyframes.length,
            round: p.round,
            rounds: p.rounds,
            match: p.match,
            text: beat.text,
          }),
      });

      const time = beat.t * plan.duration + holds;
      keyframes.push({
        pose: beat.text,
        match: refined.match,
        converged: refined.converged,
        quats: refined.quats,
        time,
        ease: beat.ease,
      });
      if (beat.hold > 0) {
        holds += beat.hold;
        keyframes.push({
          pose: `${beat.text} (held)`,
          match: refined.match,
          converged: refined.converged,
          quats: refined.quats,
          time: time + beat.hold,
          ease: "linear",
        });
      }
    }

    const duration = plan.duration + holds;
    keyframes.push({
      pose: endName,
      match: null,
      converged: true,
      quats: endQuats,
      time: duration,
      ease: "inOut",
    });
    return { keyframes, duration, beats: plan.keyframes.length };
  } finally {
    // The stage model always goes back to its initial pose, success or not.
    restorePose(bones, startQuats);
  }
}
