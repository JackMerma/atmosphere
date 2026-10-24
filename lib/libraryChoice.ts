import { bonesOf, restorePose, snapshotPose, type PoseQuats } from "@/lib/pose";
import { applySegmentsToRig, type PoseSegments } from "@/lib/poseRetarget";
import { nearestPoses, toCameraFrame, type LibraryPose } from "@/lib/poseLibrary";
import { JUDGE_VIEWS } from "@/lib/viewAngles";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

async function rank(candidates: string[][], text: string): Promise<number> {
  const res = await fetch("/api/motion/rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Jev could not compare the poses.");
  return data.best as number;
}

export interface Chosen {
  quats: PoseQuats;
  /** The chosen pose's directions, in the camera's frame; what a mirror works on. */
  segments: PoseSegments;
  pose: LibraryPose;
  /** How far the chosen pose sits from what the planner asked for, in degrees. */
  distance: number;
}

/**
 * Picks the library pose that best answers one beat, and leaves the rig in it.
 *
 * This is the whole change of approach: Jev stops searching for a pose and
 * starts choosing between poses a real person already held. Searching asked it
 * to hill-climb on a signal it reads badly, over ten rounds that `status.md`
 * admits were never shown to improve anything. Choosing is a Choice, which is
 * the question it is good at, and it takes one call.
 *
 * The narrowing is measured and the pick is asked -- the same split `decisions.md`
 * already settled on for attention. The planner states the exact direction every
 * segment should point, so cutting hundreds of poses down to a handful costs
 * nothing and asks nobody. Only the last step is worth a question, because that
 * is the part a number gets wrong: two poses a degree apart on paper can read
 * very differently on a body.
 */
export async function chooseLibraryPose(args: {
  side: Side;
  /** The planner's target for this beat, in the camera's frame. */
  target: PoseSegments;
  /** What the beat is, which is what Jev judges against. */
  text: string;
  library: LibraryPose[];
  /** How many of the nearest poses Jev is shown. */
  candidates: number;
  /** The pose before this one, carried into joints the library pose leaves out. */
  previous: PoseQuats;
}): Promise<Chosen> {
  const { side, target, text, library, candidates, previous } = args;
  const { viewport } = useAtmosphereStore.getState();
  const bones = bonesOf(side);
  if (!viewport || bones.length === 0) throw new Error("Load a model first.");
  if (library.length === 0) throw new Error("No pose library has been harvested.");

  // The library is in world directions; the planner's target is in the camera's.
  const inFrame = library.map((pose) => ({
    pose,
    segments: toCameraFrame(pose.segments, viewport.camera),
  }));
  const shortlist = nearestPoses(
    target,
    inFrame.map(({ pose, segments }) => ({ ...pose, segments })),
    candidates
  );

  const built = shortlist.map(({ pose, distance }) => {
    // From the pose before it, so joints this library pose does not define stay
    // where the motion left them rather than snapping back to rest.
    restorePose(bones, previous);
    applySegmentsToRig(bones, pose.segments, viewport.camera);
    return { pose, distance, segments: pose.segments, quats: snapshotPose(bones) };
  });

  // One option is enough to answer with; there is nothing to choose between.
  if (built.length === 1) {
    restorePose(bones, built[0].quats);
    return built[0];
  }

  const shots: string[][] = [];
  for (const candidate of built) {
    restorePose(bones, candidate.quats);
    shots.push(await Promise.all(JUDGE_VIEWS.map((yaw) => viewport.capture(side, yaw))));
  }

  const winner = built[await rank(shots, text)];
  restorePose(bones, winner.quats);
  // The shortlist is logged, not just the winner: when a choice looks wrong it
  // matters whether the right pose was never offered (the measured narrowing is
  // at fault) or was offered and passed over (the judge is).
  console.info(
    `[library] "${text.slice(0, 40)}" -> ${winner.pose.label} @${winner.pose.time}s ` +
      `(${winner.distance.toFixed(1)}deg) from [` +
      built.map((c) => `${c.pose.label} ${c.distance.toFixed(0)}deg`).join(", ") +
      `]`
  );
  return winner;
}
