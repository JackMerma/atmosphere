import {
  applySegmentsToRig,
  measureSegments,
  mirrorSegments,
  type PoseSegments,
} from "@/lib/poseRetarget";
import { loadLibrary } from "@/lib/poseLibrary";
import { chooseLibraryPose } from "@/lib/libraryChoice";
import { bonesOf, poseDistance, restorePose, restQuats, slotQuats, snapshotPose } from "@/lib/pose";
import { refinePose } from "@/lib/refine";
import type { MotionSettings } from "@/lib/motionSettings";
import type { Keyframe } from "@/lib/animations";
import type { MotionPlan } from "@/lib/plannerClient";
import { tuneMotion } from "@/lib/tuneMotion";
import { DEFAULT_MOTION, type MotionParams } from "@/lib/motionParams";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/** Length of an animation with no prompt: straight from the initial to the final state. */
const DEFAULT_DURATION = 2;
/** Below this many degrees the two states count as the same pose. */
const SAME_POSE_DEGREES = 2;

export interface Progress {
  phase: "planning" | "choosing" | "refining" | "tuning";
  /** Which pose is being polished, 1-based, and how many there are. */
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
  loop: boolean;
  /** Poses the planner authored. */
  beats: number;
  /** How those poses are played: the dials Jev settled on. */
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
 * Builds an animation on the stage model.
 *
 * With no prompt it is a direct, eased blend from the initial state to the
 * final one. With a prompt the planner authors the WHOLE set of poses the
 * action is made of -- for "walking", the contact and passing poses of a cycle
 * -- along with its duration, each pose's easing and hold, and whether it
 * loops. Every authored pose is first built exactly from the planner's vectors,
 * then polished by Jev against its own description, which is where bad physics
 * and stray limbs get corrected. A state the user pinned by hand overrides the
 * planner's first or last pose.
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

  const bones = bonesOf("initial");
  const startQuats = slotQuats("initial", bones);
  const endQuats = slotQuats("final", bones);

  if (prompt.trim().length === 0) {
    if (poseDistance(startQuats, endQuats) < SAME_POSE_DEGREES) {
      throw new Error(
        "The initial and final states are the same: change one, or describe a motion."
      );
    }
    return {
      keyframes: [
        {
          pose: slots.initial.name ?? "Initial state",
          match: null,
          converged: true,
          quats: startQuats,
          time: 0,
          ease: "inOut",
        },
        {
          pose: slots.final.name ?? "Final state",
          match: null,
          converged: true,
          quats: endQuats,
          time: DEFAULT_DURATION,
          ease: "inOut",
        },
      ],
      duration: DEFAULT_DURATION,
      loop: false,
      beats: 0,
      motion: DEFAULT_MOTION,
    };
  }

  try {
    onProgress({
      phase: "planning",
      keyframe: 0,
      keyframeCount: 0,
      round: 0,
      rounds: 0,
      match: null,
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
    const plan = await requestPlan(request);

    // With a library, Jev chooses between poses a real person held rather than
    // searching for one. An empty or missing library is not an error: the app
    // falls back to the planner authoring poses outright, as it did before.
    const library = settings.libraryCandidates > 0 ? await loadLibrary() : [];
    const choosing = library.length > 0;

    // In a mirrored cycle only the first half is authored and judged; the rest
    // is its exact left-right reflection, which is what keeps a walk symmetric
    // instead of drifting as each pose is polished on its own.
    const half = plan.mirrorHalf ? plan.keyframes.length / 2 : plan.keyframes.length;

    const keyframes: Keyframe[] = [];
    /** What each beat of the first half actually ended up using, for the mirror. */
    const used: PoseSegments[] = [];
    let holds = 0;
    let previous = startQuats;

    for (let i = 0; i < plan.keyframes.length; i++) {
      const beat = plan.keyframes[i];
      const source = i < half ? beat : plan.keyframes[i - half];
      // The mirrored half reflects the pose the first half SETTLED on, not the
      // one the planner asked for: with a library those are different poses,
      // and mirroring the request would break the symmetry mirroring exists for.
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

      let quats = pinned;
      let match: number | null = null;
      let converged = true;

      if (!quats) {
        if (i >= half) {
          // A mirrored pose is already exact; judging it again would only let it
          // drift away from the half it is supposed to match.
          restorePose(bones, previous);
          applySegmentsToRig(bones, segments, viewport.camera);
          quats = snapshotPose(bones);
        } else if (choosing) {
          onProgress({
            phase: "choosing",
            keyframe: i + 1,
            keyframeCount: plan.keyframes.length,
            round: 0,
            rounds: 0,
            match: null,
            text,
          });
          const chosen = await chooseLibraryPose({
            side: "initial",
            target: segments,
            text,
            library,
            candidates: settings.libraryCandidates,
            previous,
          });
          quats = chosen.quats;
          used[i] = chosen.segments;
        } else {
          // Build the pose from the planner's vectors, carrying over the one
          // before it so unmentioned joints stay where the motion left them.
          restorePose(bones, previous);
          applySegmentsToRig(bones, segments, viewport.camera);
          const refined = await refinePose({
            side: "initial",
            // The planner's own vectors, so attention is measured rather than guessed.
            target: { text, segments },
            settings,
            onProgress: (p) =>
              onProgress({
                phase: "refining",
                keyframe: i + 1,
                keyframeCount: plan.keyframes.length,
                round: p.round,
                rounds: p.rounds,
                match: p.match,
                text,
              }),
          });
          quats = refined.quats;
          match = refined.match;
          converged = refined.converged;
          used[i] = segments;
        }
      }

      const time = beat.t * plan.duration + holds;
      keyframes.push({
        pose: text,
        grounded: beat.grounded,
        match,
        converged,
        quats,
        time,
        ease: first ? "inOut" : beat.ease,
      });
      if (beat.hold > 0 && !last) {
        holds += beat.hold;
        keyframes.push({
          pose: `${text} (held)`,
          grounded: beat.grounded,
          match,
          converged,
          quats,
          time: time + beat.hold,
          ease: "linear",
        });
      }
      previous = quats;
    }

    const duration = plan.duration + holds;

    // The poses are as close to what was asked for as judging them one at a
    // time can get them. What is left is how they are PLAYED, which no pose
    // says anything about -- so Jev is shown the whole motion as strips of
    // frames and asked which way of playing it reads best.
    const motion = await tuneMotion({
      motion: { keyframes, duration, loop: plan.loop },
      prompt,
      rounds: settings.motionRounds,
      onProgress: (p) =>
        onProgress({
          phase: "tuning",
          keyframe: plan.keyframes.length,
          keyframeCount: plan.keyframes.length,
          round: p.round,
          rounds: p.rounds,
          match: null,
          text: "How it moves",
        }),
    });

    return { keyframes, duration, loop: plan.loop, beats: plan.keyframes.length, motion };
  } finally {
    // The stage model always goes back to its initial pose, success or not.
    restorePose(bones, startQuats);
  }
}
