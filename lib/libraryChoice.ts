import { bonesOf, restorePose, snapshotPose, type PoseQuats } from "@/lib/pose";
import { applySegmentsToRig, type PoseSegments } from "@/lib/poseRetarget";
import { nearestPoses, toCameraFrame, type LibraryPose } from "@/lib/poseLibrary";
import { JUDGE_VIEWS } from "@/lib/viewAngles";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";
import { useDebugFilm } from "@/store/useDebugFilm";

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

interface Built extends Chosen {
  /** One image per camera angle, captured once and reused in every round. */
  shots: string[];
}

/** Splits a list into chunks of at most `size`, which is one Jev question each. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `jobs` with at most `limit` in flight, keeping the results in order. */
export async function pooled<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(jobs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    for (let i = next++; i < jobs.length; i = next++) results[i] = await jobs[i]();
  });
  await Promise.all(workers);
  return results;
}

/**
 * Picks the library pose that best answers one of the planner's poses, and
 * leaves the rig in it.
 *
 * Two steps, and no third. First the whole vocabulary is MEASURED against what
 * the planner asked for, which costs nothing and asks nobody, and the nearest
 * `ranked` poses survive. Then Jev is ASKED which of those is right, because
 * that is the part a number gets wrong: two poses a degree apart on paper can
 * read very differently on a body.
 *
 * The asking is a knockout. Jev compares `perQuery` poses at a time, so a
 * shortlist longer than that is played off in rounds -- each question's winner
 * goes through to the next round until one is left. Questions within a round do
 * not depend on each other, so `concurrency` of them run at once.
 *
 * `perQuery` of 1 means there is nothing to compare, so Jev is not asked at all
 * and the measured nearest wins outright. That is the honest way to see what
 * the asking is worth: run the same prompt at 1 and at 4 and look at both.
 *
 * Every candidate is photographed once, up front, and those images are reused
 * in every round it survives: a pose that wins three rounds is rendered once,
 * not three times. The photographs are of a fixed stand-in body, never of the
 * uploaded model -- see `lib/mannequin.ts` for why.
 */
export async function chooseLibraryPose(args: {
  side: Side;
  /** What the planner asked for, in the camera's frame. */
  target: PoseSegments;
  /** The description Jev judges the pictures against. */
  text: string;
  library: LibraryPose[];
  /** How many of the nearest poses go into the knockout. */
  ranked: number;
  /** How many poses Jev compares in one question. */
  perQuery: number;
  /** How many questions of a round are asked at once. */
  concurrency: number;
  /** The pose before this one, carried into joints the library pose leaves out. */
  previous: PoseQuats;
}): Promise<Chosen> {
  const { side, target, text, library, ranked, perQuery, concurrency, previous } = args;
  const { viewport } = useAtmosphereStore.getState();
  const bones = bonesOf(side);
  if (!viewport || bones.length === 0) throw new Error("Load a model first.");
  if (library.length === 0) throw new Error("No pose library has been harvested.");

  // The library is in world directions; the planner's target is in the camera's.
  const inFrame = library.map((pose) => ({
    ...pose,
    segments: toCameraFrame(pose.segments, viewport.camera),
  }));
  const shortlist = nearestPoses(target, inFrame, ranked);

  // Build and photograph every candidate once. The pose that is KEPT is built
  // on the user's model, carrying over the pose before it so joints this
  // library pose does not define stay where the motion left them. The pose that
  // is SHOWN is the same directions on the stand-in body, which is a shape
  // rather than a costume and so a fairer thing to be asked about.
  const built: Built[] = [];
  const pushFrame = useDebugFilm.getState().push;
  for (const { pose, distance } of shortlist) {
    restorePose(bones, previous);
    applySegmentsToRig(bones, pose.segments, viewport.camera);
    const quats = snapshotPose(bones);
    const shots = await Promise.all(
      JUDGE_VIEWS.map(async (yaw) => {
        const image = await viewport.captureProxy(pose.segments, yaw, side);
        // Logged the instant it is captured, not after the round's Jev call
        // returns, so the strip fills in live as the knockout runs rather than
        // jumping in batches once each question resolves.
        pushFrame({ poseText: text, candidateLabel: `${pose.label} @${pose.time}s`, distance, yaw, image });
        return image;
      })
    );
    built.push({ pose, distance, segments: pose.segments, quats, shots });
  }
  // Posing the proxy left the user's model on the last candidate.
  restorePose(bones, previous);

  let round = built;
  let questions = 0;
  // Nothing to choose between: the measurement already answered it.
  while (perQuery > 1 && round.length > 1) {
    const heats = chunk(round, perQuery);
    const winners = await pooled(
      heats.map((heat) => async () => {
        // A heat of one has already won it; asking would waste a question.
        if (heat.length === 1) return heat[0];
        questions++;
        return heat[await rank(heat.map((c) => c.shots), text)];
      }),
      Math.max(1, concurrency)
    );
    // Nothing was eliminated, so no further round can eliminate anything either.
    if (winners.length === round.length) break;
    round = winners;
  }

  const winner = round[0];
  restorePose(bones, winner.quats);
  console.info(
    `[library] "${text.slice(0, 40)}" -> ${winner.pose.label} @${winner.pose.time}s ` +
      `(${winner.distance.toFixed(1)}deg) from ${built.length} ranked in ${questions} question(s)`
  );
  return winner;
}
