import { captureStrip } from "@/lib/motionStrip";
import {
  DEFAULT_MOTION,
  describeMotion,
  jitter,
  motionMoves,
  nudge,
  type MotionParams,
} from "@/lib/motionParams";
import type { Motion } from "@/lib/timeline";

/**
 * Ways of playing the motion tried against the one we have, per round.
 *
 * Three, not more, because each one is a whole animation rendered twice: the
 * cost of a round is frames x angles x candidates, and a judge comparing four
 * strips at once is already being asked a lot.
 */
const VARIANTS = 3;

export interface TuneProgress {
  round: number;
  rounds: number;
  /** Whether this round found something better than what it started with. */
  improved: boolean;
}

async function rank(candidates: string[][], text: string) {
  const res = await fetch("/api/motion/rank-motion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not judge the motion.");
  return data.best as number;
}

const identical = (a: MotionParams, b: MotionParams) =>
  (Object.keys(a) as (keyof MotionParams)[]).every((k) => a[k] === b[k]);

/**
 * Tunes how an authored set of poses is played, by showing Jev the whole motion.
 *
 * The poses are already as close to what was asked for as the pose refinement
 * could get them. What is left is everything the poses do not say: how far the
 * body commits to each one, how much the limbs trail, how hard the floor pushes
 * back, where the arms sit in the cycle, how the time between poses is spent.
 * Those were constants, and the honest reason they were constants is that
 * nobody knew what to set them to.
 *
 * So each round builds a few variants, renders every one of them as a strip of
 * frames in time order, and asks Jev which strip reads best as the motion
 * asked for -- with the one we already have among the options, so a round can
 * hold but never make things worse. One dial moves at a time, because a judge
 * can say which of two motions is better but not why, and a verdict on two
 * dials moved together says nothing about either.
 *
 * The poses never change here. Only how they are played.
 */
export async function tuneMotion(args: {
  motion: Motion;
  /** What the user asked for, which is what the motion is judged against. */
  prompt: string;
  rounds: number;
  onProgress?: (p: TuneProgress) => void;
}): Promise<MotionParams> {
  const { motion, prompt, rounds, onProgress } = args;
  if (rounds <= 0) return DEFAULT_MOTION;

  let best = DEFAULT_MOTION;
  let bestStrips = await captureStrip({ animation: motion, params: best });
  const moves = motionMoves();
  let scale = 1;

  for (let round = 1; round <= rounds; round++) {
    const options: MotionParams[] = [best];
    const strips: string[][] = [bestStrips];

    while (options.length <= VARIANTS) {
      const move = moves.pop();
      // A dial already at the end of its range gives back the motion we have,
      // which would waste a slot and an option a judge has to look at.
      const variant = move ? nudge(best, move.key, move.by) : jitter(best, scale);
      if (identical(variant, best)) {
        if (move) continue;
        break;
      }
      options.push(variant);
      strips.push(await captureStrip({ animation: motion, params: variant }));
    }
    if (options.length < 2) break;

    const winner = await rank(strips, prompt);
    const improved = winner > 0;
    if (improved) {
      best = options[winner];
      bestStrips = strips[winner];
    } else if (moves.length === 0) {
      // Nothing beat what we have and the single-dial moves are spent; aim smaller.
      scale = Math.max(scale * 0.7, 0.2);
    }
    onProgress?.({ round, rounds, improved });
  }

  console.info(`[tune] ${describeMotion(best)}`);
  return best;
}
