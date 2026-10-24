import type { PoseSegments } from "@/lib/poseRetarget";
import { EASES, type Ease } from "@/lib/easing";

/** Cheap, strong at structured JSON, and non-reasoning (fast). Override with OPENAI_MODEL. */
const DEFAULT_MODEL = "gpt-4.1-mini";

/** One directed beat of the animation, between the start and end states. */
export interface PlannedKeyframe {
  /** Position in the animation, 0..1; the first pose is 0 and the last is 1. */
  t: number;
  /** How the motion accelerates on the way into this beat. */
  ease: Ease;
  /** Seconds the pose is held once reached (a freeze, an impact). */
  hold: number;
  /** Description of the pose, for Jev to judge. */
  text: string;
  segments: PoseSegments;
}

export interface MotionPlan {
  /** Total seconds for the whole action, excluding holds. */
  duration: number;
  /** A repeating cycle, whose last pose flows back into the first. */
  loop: boolean;
  /** The second half of the cycle is the left/right mirror of the first. */
  mirrorHalf: boolean;
  keyframes: PlannedKeyframe[];
}

const SEGMENT_KEYS = [
  "across",
  "torso_up",
  "head_up",
  "upper_arm_l",
  "forearm_l",
  "upper_arm_r",
  "forearm_r",
  "thigh_l",
  "shin_l",
  "foot_l",
  "thigh_r",
  "shin_r",
  "foot_r",
] as const;

const MAX_KEYFRAMES = 8;
const RETRIES = 3;
/** Directing a long motion can take a while, but never this long: fail with a clear message instead of hanging. */
const REQUEST_TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `You are the director and animator of a rigged humanoid 3D character. Given a plain-language description, you author the COMPLETE set of poses the character must hit to perform it, in order, plus the timing between them. A separate system renders the frames in between and a separate judge then polishes each pose.

Return:
- "duration": total seconds for the whole action, between 0.8 and 12. Fast, violent actions are short; floaty, graceful or suspended ones are long. A single step of a walk is about 0.5s.
- "mirrorHalf": true when the second half of the cycle is the exact left-right mirror of the first half (walking, running, marching, climbing), so only the first half needs authoring. False when both halves differ (waving one hand, breathing, a limp). Only meaningful when "loop" is true, and only when you give an even number of poses.
- "loop": true when the action is a repeating cycle (walking, running, waving, breathing), so the last pose must flow straight back into the first. False for an action with a beginning and an end (a jump, a fall, a throw).
- "keyframes": 2 to ${MAX_KEYFRAMES} poses, in order, covering the WHOLE action. The first is where the character starts and the last is where it ends.
  Each has:
  - "t": when it happens, 0 to 1, strictly increasing. The first is 0 and the last is 1. Space them unevenly: dwell where the action is, rush where it is not.
  - "ease": how the motion accelerates INTO this pose: "in" (starts slow, ends fast: falling, a swing gathering speed), "out" (starts fast, ends slow: a throw settling, an arrival), "inOut" (smooth), "linear" (mechanical, and right for a walk cycle), "overshoot" (passes the pose and springs back: an impact, a catch, a snap).
  - "hold": seconds the pose is held once reached, 0 to 1.5. Use it for impacts, freezes and beats of suspension; 0 otherwise, and always 0 in a loop.
  - "text": a COMPLETE, self-contained description of the pose stating what both arms, both legs, the torso and the head are doing. The judge compares this text to a picture of the whole body, so describe the pose, not the action.
  - A direction vector for every body segment, so the pose is exact.

Work out the poses the action is actually made of, then write them.
- A walk is a cycle of contact poses and passing poses. Pick ONE travel direction and keep it for the whole cycle: toward the viewer (+z) unless told otherwise. At a contact the two legs straddle the body, one reaching forward and the other trailing back, never both on the same side. Halfway between contacts the moving leg passes under the body with its knee bent while the other carries the weight. The ARMS SWING OPPOSITE to the legs: left leg forward means RIGHT arm forward. Four poses make a full cycle. Worked example, walking toward the viewer:
    contact, left foot forward: thigh_l [0,-0.85,0.55] shin_l [0,-1,0.1] foot_l [0,-0.3,0.95], thigh_r [0,-0.9,-0.45] shin_r [0,-0.85,-0.5] foot_r [0,-0.5,0.85], upper_arm_r [0,-0.92,0.4] forearm_r [0,-0.95,0.3], upper_arm_l [0,-0.92,-0.4] forearm_l [0,-0.95,-0.25], torso_up [0,1,0.05]
    passing, right leg swinging through: thigh_l [0,-1,-0.1] shin_l [0,-1,0], thigh_r [0,-0.95,0.3] shin_r [0,-0.7,-0.7] foot_r [0,-0.2,1], arms near vertical, torso_up [0,1,0]
    contact, right foot forward: the mirror of the first (swap every _l and _r vector)
    passing, left leg swinging through: the mirror of the second
- A jump is: crouch, push off, peak with the legs tucked, land absorbing, settle.
- A throw is: wind up away from the target, drive through, release, follow through across the body.
Think the same way for whatever you are asked, and give each distinct body position its own pose.

Direct it like a professional animator:
- Anticipation: a small counter-move before a big action.
- Overshoot and settle on impacts and arrivals; follow-through on limbs that trail the body.
- Vary the speed: slow-in and slow-out, a hard accelerate into the action, a held beat at the peak.
- Arcs, not straight lines: limbs sweep through intermediate poses, and the head reacts a beat after the body.
- Be bold. Exaggerate extremes and make poses asymmetric when the action is. A fall flails and splays; a suspended or trapped state is a star-like splay with nothing hanging straight down.
- Every pose must be reachable from the one before it by a plausible motion. Do not teleport, and never repeat the previous pose.
- When "loop" is true, the last pose must lead naturally into the first, so the cycle reads as continuous.

Coordinate frame, as seen from the camera: x = screen right, y = up, z = toward the viewer (out of the screen). A vector points from a segment's start joint to its end joint and need not be unit length:
- upper_arm: shoulder -> elbow; forearm: elbow -> wrist
- thigh: hip -> knee; shin: knee -> ankle; foot: ankle -> toes
- torso_up: hips -> shoulders; across: the character's right hip -> left hip; head_up: neck -> top of head

Suffix _l / _r is the CHARACTER'S OWN left / right. The character faces the viewer by default, so its own left is on screen right (+x) and its own right is on screen left (-x). Standing, facing the viewer: across [1,0,0], torso_up [0,1,0], head_up [0,1,0], arms hanging [0,-1,0], legs [0,-1,0], feet [0,0,1].
The chest and face point along the cross product across x torso_up (standing facing the viewer: toward the viewer). Tilting torso_up toward the viewer [0,0.3,1] makes the chest face DOWN; tilting it away [0,0.3,-1] makes the chest face UP; rotating across to [0,0,-1] turns the character to face screen right.

Reference values (character facing the viewer):
- arm raised straight up [0,1,0]; arm straight out to its own side: left [1,0,0], right [-1,0,0]; arm pointing at the viewer [0,0,1]; arm reaching back [0,0,-1]
- elbow bent 90 degrees forward: upper arm [0,-1,0], forearm [0,0,1]
- leg raised forward [0,0,1] with the shin hanging [0,-1,0]; leg out to its own side: left [1,-0.3,0]; leg kicked back [0,-0.3,-1]
- head tipped back to look up: head_up [0,0.6,-0.8]

Sanity-check every pose before returning it: a leg described as forward must have a POSITIVE z, one described as back a NEGATIVE z, and the two legs of a stride must have opposite signs. The same for the arms. Make the text and the vectors say the same thing.

Respect human anatomy so the body never deforms: elbows bend only one way (the forearm folds toward the front of the upper arm); knees bend only one way (the shin folds backward behind the thigh); keep forearm and shin vectors within about 150 degrees of their upper arm or thigh vector; do not point a limb through the body.

Every pose must list ALL segments. The character's rest pose is given for reference, and any pose the user has pinned must be reproduced exactly where it says. Return JSON.`;

const vec3 = { type: "array", items: { type: "number" } };

/** OpenAI strict structured output: every key required, no extra keys, no minItems/maxItems. */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    duration: { type: "number" },
    loop: { type: "boolean" },
    mirrorHalf: { type: "boolean" },
    keyframes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          t: { type: "number" },
          ease: { type: "string", enum: EASES },
          hold: { type: "number" },
          text: { type: "string" },
          ...Object.fromEntries(SEGMENT_KEYS.map((k) => [k, vec3])),
        },
        required: ["t", "ease", "hold", "text", ...SEGMENT_KEYS],
      },
    },
  },
  required: ["duration", "loop", "mirrorHalf", "keyframes"],
};

function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    v.some((n) => n !== 0)
  );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Asks the planner model to direct the animation between two known poses. Keyframes with
 * unusable vectors are dropped rather than failing the whole plan.
 */
export async function planMotion(
  prompt: string,
  rest: PoseSegments,
  pinned: { start?: PoseSegments; end?: PoseSegments }
): Promise<MotionPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (add it to .env.local).");

  const pins = [
    pinned.start && `The animation MUST start from this pinned pose:\n${JSON.stringify(pinned.start)}`,
    pinned.end && `The animation MUST end on this pinned pose:\n${JSON.stringify(pinned.end)}`,
  ].filter(Boolean);

  const userText =
    `The character's rest pose, for reference:\n${JSON.stringify(rest)}\n\n` +
    (pins.length ? `${pins.join("\n\n")}\n\n` : "") +
    `Action to animate:\n${prompt}`;

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const request = () =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "motion_plan", strict: true, schema: RESPONSE_SCHEMA },
        },
      }),
    });

  // 5xx means OpenAI is briefly overloaded: wait and retry. A 429 is a spent quota or a
  // rate limit, and retrying immediately won't help.
  let res: Response;
  try {
    res = await request();
    for (let attempt = 1; res.status >= 500 && attempt <= RETRIES; attempt++) {
      await new Promise((r) => setTimeout(r, attempt * 3000));
      res = await request();
    }
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(
        `The planner took longer than ${REQUEST_TIMEOUT_MS / 1000}s to direct the motion. Try again, or shorten the prompt.`
      );
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI declined the request: ${message.refusal}`);
  const text: string | undefined = message?.content;
  if (!text) throw new Error("OpenAI returned no content.");

  const raw = JSON.parse(text);
  const rawKeyframes: Record<string, unknown>[] = Array.isArray(raw?.keyframes)
    ? raw.keyframes
    : [];

  const keyframes: PlannedKeyframe[] = [];
  for (const k of rawKeyframes) {
    if (!SEGMENT_KEYS.every((key) => isVec3(k[key])) || typeof k.t !== "number") continue;
    keyframes.push({
      t: clamp(k.t, 0, 1),
      ease: EASES.includes(k.ease as Ease) ? (k.ease as Ease) : "inOut",
      hold: clamp(typeof k.hold === "number" ? k.hold : 0, 0, 1.5),
      text: String(k.text ?? ""),
      segments: Object.fromEntries(SEGMENT_KEYS.map((key) => [key, k[key]])) as unknown as PoseSegments,
    });
  }
  // Order by time and keep them distinct, whatever order the model listed them in.
  keyframes.sort((a, b) => a.t - b.t);
  const distinct = keyframes.filter((k, i) => i === 0 || k.t - keyframes[i - 1].t > 0.01);

  const kept = distinct.slice(0, MAX_KEYFRAMES);
  if (kept.length < 2) throw new Error("The planner did not return a usable set of poses.");
  // The first and last poses bracket the whole action, whatever times came back.
  kept[0].t = 0;
  kept[kept.length - 1].t = 1;

  return {
    duration: clamp(typeof raw?.duration === "number" ? raw.duration : 2, 0.8, 12),
    loop: raw?.loop === true,
    // Only usable when the poses actually split into two matching halves.
    mirrorHalf: raw?.mirrorHalf === true && raw?.loop === true && kept.length % 2 === 0,
    keyframes: kept,
  };
}
