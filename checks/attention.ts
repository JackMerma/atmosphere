import { __testing } from "@/lib/refine";
import type { PoseSegments } from "@/lib/poseRetarget";

const { attentionFromSegments, structuredCandidates } = __testing;

const results: string[] = [];
let failures = 0;
const check = (l: string, ok: boolean, d: string) => {
  results.push((ok ? "PASS  " : "FAIL  ") + l + "  " + d);
  if (!ok) failures++;
};

/** Standing straight, facing the viewer. */
const standing: PoseSegments = {
  across: [1, 0, 0],
  torso_up: [0, 1, 0],
  head_up: [0, 1, 0],
  upper_arm_l: [0, -1, 0],
  forearm_l: [0, -1, 0],
  upper_arm_r: [0, -1, 0],
  forearm_r: [0, -1, 0],
  thigh_l: [0, -1, 0],
  shin_l: [0, -1, 0],
  foot_l: [0, 0, 1],
  thigh_r: [0, -1, 0],
  shin_r: [0, -1, 0],
  foot_r: [0, 0, 1],
};

const withChange = (patch: Partial<PoseSegments>): PoseSegments => ({ ...standing, ...patch });

// 1. Raising one arm puts attention on that arm, and on nothing else.
{
  const target = withChange({ upper_arm_r: [0, 1, 0], forearm_r: [0, 1, 0] });
  const focus = attentionFromSegments(standing, target);
  check("One raised arm is the only focus", focus.length === 1 && focus[0] === "right arm", focus.join(", ") || "nothing");
}

// 2. The part that is further off comes first.
{
  const target = withChange({
    upper_arm_l: [0, 1, 0], // a half turn away
    thigh_r: [0, -1, 0.2], // barely moved
  });
  const focus = attentionFromSegments(standing, target);
  check("Worst part leads", focus[0] === "left arm", focus.join(" > "));
  check("The smaller error still gets a look", focus.includes("right leg"), focus.join(" > "));
}

// 3. A pose already reached needs no attention at all.
{
  const focus = attentionFromSegments(standing, standing);
  check("A matching pose focuses on nothing", focus.length === 0, focus.join(", ") || "nothing");
}

// 4. A change below the threshold is noise, not a target.
{
  const target = withChange({ upper_arm_l: [0.03, -1, 0] });
  const focus = attentionFromSegments(standing, target);
  check("Tiny differences are ignored", focus.length === 0, focus.join(", ") || "nothing");
}

// 5. A whole-body change lists every part, worst first.
{
  const target = withChange({
    upper_arm_l: [1, 0, 0],
    upper_arm_r: [0, 1, 0],
    thigh_l: [0, 0, 1],
    head_up: [0, 0.9, -0.4],
    torso_up: [0, 0.95, 0.3],
  });
  const focus = attentionFromSegments(standing, target);
  check("Everything that moved is listed", focus.length === 5, focus.join(" > "));
  check("Right arm (180 degrees) leads", focus[0] === "right arm", focus.join(" > "));
}

// 6. Candidate moves are reordered to try the focused part first.
{
  const focus = attentionFromSegments(
    standing,
    withChange({ thigh_r: [0, 0, 1], shin_r: [0, 0, 1] })
  );
  const moves = structuredCandidates(focus);
  // The first move mirrors the depth of the leading chain; applied to the
  // standing pose it must therefore change the right leg.
  const after = moves[0](standing);
  const changedRightLeg = after.foot_r![2] !== standing.foot_r![2];
  check("The focused part is tried first", changedRightLeg, "first move touches the right leg");
  check("Every part still gets a move", moves.length >= 6 * 3, moves.length + " moves queued");
}

console.log(results.join("\n"));
console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
process.exit(failures === 0 ? 0 : 1);
