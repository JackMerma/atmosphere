import type { PoseSegments } from "@/lib/poseRetarget";
import { EASES, type Ease } from "@/lib/easing";

/** Cheap, strong at structured JSON, and non-reasoning (fast). Override with OPENAI_MODEL. */
const DEFAULT_MODEL = "gpt-4.1-mini";

/** One directed beat of the animation, between the start and end states. */
export interface PlannedKeyframe {
  /** Position in the animation, 0..1 (excluding the start and end states). */
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
  /** Total seconds from the start state to the end state, excluding holds. */
  duration: number;
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

const SYSTEM_PROMPT = `You are the director and animator of a rigged humanoid 3D character. You are given its START pose and its END pose as segment vectors, and a plain-language description of the motion between them. You decide everything that makes the animation feel produced: how long it takes, which poses it passes through, and how fast each part moves. A separate system then renders the in-between frames.

Return:
- "duration": total seconds from START to END, between 0.8 and 12. Fast, violent actions are short; floaty, graceful or suspended ones are long.
- "keyframes": 0 to ${MAX_KEYFRAMES} intermediate poses, in order, strictly between START and END (never repeat either). Use none for a simple move that needs no detour.
  Each keyframe has:
  - "t": when it happens, 0.05 to 0.95, strictly increasing. Space them unevenly: dwell where the action is, rush where it is not.
  - "ease": how the motion accelerates INTO this pose: "in" (starts slow, ends fast: falling, a swing gathering speed), "out" (starts fast, ends slow: a throw settling, an arrival), "inOut" (smooth), "linear" (mechanical), "overshoot" (passes the pose and springs back: an impact, a catch, a snap).
  - "hold": seconds the pose is held once reached, 0 to 1.5. Use it for impacts, freezes and beats of suspension; 0 otherwise.
  - "text": a COMPLETE, self-contained description of the pose stating what both arms, both legs, the torso and the head are doing. A separate judge compares it to a picture of the whole body.
  - A direction vector for every body segment, so the pose is exact.

Direct it like a professional animator:
- Anticipation: a small counter-move before a big action (crouch before a jump, wind up before a throw).
- Overshoot and settle on impacts and arrivals; follow-through on limbs that trail the body.
- Vary the speed: slow-in and slow-out, a hard accelerate into the action, a held beat at the peak.
- Arcs, not straight lines: limbs sweep through intermediate poses, and the head reacts a beat after the body.
- Be bold. Exaggerate extremes and make poses asymmetric when the action is. A fall flails and splays; a suspended or trapped state is a star-like splay with nothing hanging straight down.
- Every keyframe must be reachable from the one before it by a plausible motion. Do not teleport.

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

Respect human anatomy so the body never deforms: elbows bend only one way (the forearm folds toward the front of the upper arm); knees bend only one way (the shin folds backward behind the thigh); keep forearm and shin vectors within about 150 degrees of their upper arm or thigh vector; do not point a limb through the body.

Every keyframe must list ALL segments. Return JSON.`;

const vec3 = { type: "array", items: { type: "number" } };

/** OpenAI strict structured output: every key required, no extra keys, no minItems/maxItems. */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    duration: { type: "number" },
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
  required: ["duration", "keyframes"],
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
  start: PoseSegments,
  end: PoseSegments
): Promise<MotionPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (add it to .env.local).");

  const userText =
    `START pose:\n${JSON.stringify(start)}\n\nEND pose:\n${JSON.stringify(end)}\n\n` +
    `Motion description:\n${prompt}`;

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
      t: clamp(k.t, 0.05, 0.95),
      ease: EASES.includes(k.ease as Ease) ? (k.ease as Ease) : "inOut",
      hold: clamp(typeof k.hold === "number" ? k.hold : 0, 0, 1.5),
      text: String(k.text ?? ""),
      segments: Object.fromEntries(SEGMENT_KEYS.map((key) => [key, k[key]])) as unknown as PoseSegments,
    });
  }
  // Order by time and keep them distinct, whatever order the model listed them in.
  keyframes.sort((a, b) => a.t - b.t);
  const distinct = keyframes.filter((k, i) => i === 0 || k.t - keyframes[i - 1].t > 0.01);

  return {
    duration: clamp(typeof raw?.duration === "number" ? raw.duration : 2, 0.8, 12),
    keyframes: distinct.slice(0, MAX_KEYFRAMES),
  };
}
