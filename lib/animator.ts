import {
  applySegmentsToRig,
  measureSegments,
  mirrorSegments,
  type PoseSegments,
} from "@/lib/poseRetarget";
import { loadLibrary } from "@/lib/poseLibrary";
import { chooseLibraryPose } from "@/lib/libraryChoice";
import { bonesOf, restorePose, restQuats, slotQuats, snapshotPose } from "@/lib/pose";
import type { MotionSettings } from "@/lib/motionSettings";
import type { Keyframe } from "@/lib/animations";
import type { MotionPlan } from "@/lib/plannerClient";
import { DEFAULT_MOTION, type MotionParams } from "@/lib/motionParams";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export interface Progress {
  phase: "planning" | "choosing";
  /** Which pose is being chosen, 1-based, and how many there are. */
  keyframe: number;
  keyframeCount: number;
  text: string;
}

export interface Generated {
  keyframes: Keyframe[];
  duration: number;
  loop: boolean;
  /** Poses the planner authored. */
  beats: number;
  /** How those poses are played back. */
  motion: MotionParams;
}

async function requestPlan(body: unknown): Promise<MotionPlan> {
  const res = await fetch("/api/motion/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not plan the motion.");
  return data as MotionPlan;
}

/**
 * Builds an animation on the stage model, in two steps and no more.
 *
 * 1. The planner authors the WHOLE set of poses the action is made of, and the
 *    timing between them.
 * 2. For each of those poses, the nearest poses in the harvested vocabulary are
 *    found by measurement, and Jev picks one of them.
 *
 * Nothing searches for a pose, nudges one, or tunes how it plays. Every pose in
 * the result is one a real person actually held, chosen rather than constructed.
 *
 * A prompt is required: there is no longer a path that blends two pinned states
 * without the planner, because every pose now comes from a description.
 *
 * The stage model is left in its initial pose, and on any failure nothing is
 * returned, so no partial animation can be saved.
 */
export async function generateAnimation(
  prompt: string,
  settings: MotionSettings,
  onProgress: (p: Progress) => void
): Promise<Generated> {
  const { scene, viewport, slots } = useAtmosphereStore.getState();
  if (!scene || !viewport) throw new Error("Load a model first.");
  if (prompt.trim().length === 0) throw new Error("Describe the motion to generate.");

  const bones = bonesOf("initial");
  const startQuats = slotQuats("initial", bones);
  const endQuats = slotQuats("final", bones);

  try {
    onProgress({
      phase: "planning",
      keyframe: 0,
      keyframeCount: 0,
      text: "Working out the poses…",
    });

    // The planner reasons in segment directions, which only a humanoid rig has.
    let request: Record<string, unknown>;
    try {
      restorePose(bones, restQuats(bones));
      request = { prompt, rest: measureSegments(bones, viewport.camera) };
      if (slots.initial.quats) {
        restorePose(bones, startQuats);
        request.start = measureSegments(bones, viewport.camera);
      }
      if (slots.final.quats) {
        restorePose(bones, endQuats);
        request.end = measureSegments(bones, viewport.camera);
      }
    } catch {
      throw new Error(
        "Describing a motion needs a humanoid skeleton (arms and legs named like Mixamo)."
      );
    }

    const [plan, library] = await Promise.all([requestPlan(request), loadLibrary()]);
    if (library.length === 0) {
      throw new Error(
        "No pose vocabulary found. Put animation files in poses/ and run: npx tsx scripts/harvest.ts"
      );
    }

    // In a mirrored cycle only the first half is chosen; the rest is its exact
    // left-right reflection, which is what keeps a walk symmetric.
    const half = plan.mirrorHalf ? plan.keyframes.length / 2 : plan.keyframes.length;

    const keyframes: Keyframe[] = [];
    /** What each pose of the first half ended up as, for the mirror to reflect. */
    const used: PoseSegments[] = [];
    let holds = 0;
    let previous = startQuats;

    for (let i = 0; i < plan.keyframes.length; i++) {
      const beat = plan.keyframes[i];
      const source = i < half ? beat : plan.keyframes[i - half];
      // The mirrored half reflects the pose the first half SETTLED on, not the
      // one the planner asked for: those are different poses, and mirroring the
      // request would break the symmetry mirroring exists for.
      const segments =
        i < half ? beat.segments : mirrorSegments(used[i - half] ?? source.segments);
      const text = i < half ? beat.text : `${source.text} (mirrored)`;
      const first = i === 0;
      const last = i === plan.keyframes.length - 1;

      // A state the user pinned wins over whatever the planner wrote for that end.
      const pinned =
        first && slots.initial.quats
          ? startQuats
          : last && slots.final.quats
            ? endQuats
            : null;

      let quats: number[][];

      if (pinned) {
        quats = pinned;
      } else if (i >= half) {
        // A mirrored pose is already exact; choosing again would only let it
        // drift away from the half it is supposed to match.
        restorePose(bones, previous);
        applySegmentsToRig(bones, segments, viewport.camera);
        quats = snapshotPose(bones);
      } else {
        onProgress({
          phase: "choosing",
          keyframe: i + 1,
          keyframeCount: plan.keyframes.length,
          text,
        });
        const chosen = await chooseLibraryPose({
          side: "initial",
          target: segments,
          text,
          library,
          ranked: settings.rankedPoses,
          perQuery: settings.optionsPerQuery,
          concurrency: settings.batches,
          previous,
        });
        quats = chosen.quats;
        used[i] = chosen.segments;
      }

      const time = beat.t * plan.duration + holds;
      keyframes.push({
        pose: text,
        grounded: beat.grounded,
        match: null,
        converged: true,
        quats,
        time,
        ease: first ? "inOut" : beat.ease,
      });
      if (beat.hold > 0 && !last) {
        holds += beat.hold;
        keyframes.push({
          pose: `${text} (held)`,
          grounded: beat.grounded,
          match: null,
          converged: true,
          quats,
          time: time + beat.hold,
          ease: "linear",
        });
      }
      previous = quats;
    }

    return {
      keyframes,
      duration: plan.duration + holds,
      loop: plan.loop,
      beats: plan.keyframes.length,
      motion: DEFAULT_MOTION,
    };
  } finally {
    // The stage model always goes back to its initial pose, success or not.
    restorePose(bones, startQuats);
  }
}
