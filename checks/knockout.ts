import { chunk, pooled } from "@/lib/libraryChoice";
import {
  BATCHES_RANGE,
  OPTIONS_PER_QUERY_RANGE,
  RANKED_RANGE,
} from "@/lib/motionSettings";

const results: string[] = [];
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + label + "  " + detail);
  if (!ok) failures++;
};

/**
 * The knockout as `chooseLibraryPose` runs it, without the rendering or the API:
 * how many rounds and questions it takes to get from `ranked` candidates down
 * to one, and whether it gets there at all.
 *
 * Simulated rather than called directly, because the real thing needs a GPU and
 * Jev. The loop shape is copied from it, so what this protects is the shape:
 * that it always terminates, always lands on one, and never asks a question it
 * does not need. `perQuery` of 1 asks nothing and leaves the field as it is --
 * the caller then takes the measured nearest.
 */
function knockout(ranked: number, perQuery: number) {
  let round = ranked;
  let questions = 0;
  let rounds = 0;
  while (perQuery > 1 && round > 1) {
    const heats = chunk(Array.from({ length: round }, (_, i) => i), perQuery);
    questions += heats.filter((h) => h.length > 1).length;
    if (heats.length === round) break;
    round = heats.length;
    rounds++;
    if (rounds > 100) throw new Error("knockout did not terminate");
  }
  return { winners: round, questions, rounds };
}

// 1. Whatever the sliders are set to, it narrows to exactly one pose and
//    terminates. Anything else is an infinite loop inside a generation.
{
  let allOne = true;
  let worst = { questions: 0, at: "" };
  for (let ranked = RANKED_RANGE.min; ranked <= RANKED_RANGE.max; ranked++) {
    for (let per = 2; per <= OPTIONS_PER_QUERY_RANGE.max; per++) {
      const { winners, questions } = knockout(ranked, per);
      if (winners !== 1) allOne = false;
      if (questions > worst.questions) {
        worst = { questions, at: `${ranked} ranked, ${per} per query` };
      }
    }
  }
  check("Every setting narrows to exactly one pose", allOne, "across the whole slider range");
  check(
    "The worst case is known and bounded",
    worst.questions === RANKED_RANGE.max - 1,
    `${worst.questions} questions at ${worst.at}`
  );
}

// 2. A question eliminates at most perQuery-1 candidates, so no bracket can do
//    better than ceil((n-1)/(perQuery-1)) questions. Fixed-size heats do not
//    pack perfectly -- a round ending in a short heat eliminates fewer -- so the
//    real count sits a little above that floor. Both halves are worth pinning:
//    the floor cannot be beaten, and the waste has to stay small.
{
  let belowFloor = "";
  let worstWaste = { over: 0, at: "" };
  for (let ranked = RANKED_RANGE.min; ranked <= RANKED_RANGE.max; ranked++) {
    for (let per = 2; per <= OPTIONS_PER_QUERY_RANGE.max; per++) {
      const floor = Math.ceil((ranked - 1) / (per - 1));
      const { questions } = knockout(ranked, per);
      if (questions < floor) belowFloor = `${ranked}/${per}: ${questions} < ${floor}`;
      const over = questions - floor;
      if (over > worstWaste.over) worstWaste = { over, at: `${ranked} ranked, ${per} per query` };
    }
  }
  check("No bracket beats the elimination floor", belowFloor === "", belowFloor || "floor holds everywhere");
  check(
    "Imperfect packing wastes few questions",
    worstWaste.over <= 3,
    `worst overhead ${worstWaste.over} question(s) at ${worstWaste.at}`
  );
}

// 3. One option per query asks nothing, which is what makes a with/without
//    comparison possible at all.
{
  const { questions, winners } = knockout(RANKED_RANGE.max, 1);
  check(
    "One option per query asks Jev nothing",
    questions === 0 && winners === RANKED_RANGE.max,
    "0 questions; the caller takes the measured nearest"
  );
}

// 4. The defaults are cheap enough to run once per pose of a plan.
{
  const { questions, rounds } = knockout(RANKED_RANGE.default, OPTIONS_PER_QUERY_RANGE.default);
  check(
    "The default settings are a handful of questions",
    questions <= 8,
    `${questions} questions over ${rounds} rounds for ${RANKED_RANGE.default} poses`
  );
}

// 5. Chunking loses nothing and reorders nothing.
{
  const items = Array.from({ length: 50 }, (_, i) => i);
  const flat = chunk(items, 4).flat();
  check(
    "Chunking keeps every candidate, in order",
    flat.length === items.length && flat.every((n, i) => n === i),
    "50 items through chunks of 4"
  );
}

// 6. The pool runs everything, keeps results in order, and respects its limit.
async function poolChecks() {
  let inFlight = 0;
  let peak = 0;
  const jobs = Array.from({ length: 13 }, (_, i) => async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return i;
  });
  const limit = BATCHES_RANGE.default;
  const out = await pooled(jobs, limit);
  check(
    "The pool keeps results in order",
    out.length === 13 && out.every((n, i) => n === i),
    "13 jobs back in order"
  );
  check("The pool respects its limit", peak <= limit, `peak ${peak} in flight, limit ${limit}`);

  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
}
poolChecks();
