import type { PoseSegments } from "@/lib/poseRetarget";

const DEFAULT_MODEL = "gemini-2.5-flash";

/** One described pose: text for Jev to judge, segment directions for the model to adopt. */
export interface PlannedPose {
  text: string;
  /** Absent when Gemini's vectors were unusable; Jev then converges from the previous pose alone. */
  segments: PoseSegments | null;
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

const SYSTEM_PROMPT = `You are a character animator who authors poses for a rigged humanoid 3D character from a plain-language motion description. You pose it like a freeze-frame of a dynamic action, not like a stiff mannequin.

Split the description into an ordered list of static poses, one per state the user explicitly described, in order. Do NOT invent a starting, resting, or ending pose the user did not mention: a single described pose yields a single entry. If the user describes a sequence with a beginning, a middle (an action in progress) and an end, give each as its own pose, in order.

For each pose return:
- "text": a COMPLETE, self-contained description stating what both arms, both legs, the torso and the head are doing (write relaxed limbs explicitly, e.g. "arms down at the sides"). A separate judge compares it to a picture of the whole body. Static body position only, no transitions.
- A direction vector for every body segment, so the character can be posed exactly.

Coordinate frame, as seen from the camera: x = screen right, y = up, z = toward the viewer (out of the screen). A vector points from a segment's start joint to its end joint and need not be unit length:
- upper_arm: shoulder -> elbow; forearm: elbow -> wrist
- thigh: hip -> knee; shin: knee -> ankle; foot: ankle -> toes
- torso_up: hips -> shoulders; across: the character's right hip -> left hip; head_up: neck -> top of head

Suffix _l / _r is the CHARACTER'S OWN left / right. The character faces the viewer by default, so its own left is on screen right (+x) and its own right is on screen left (-x). Standing, facing the viewer: across [1,0,0], torso_up [0,1,0], head_up [0,1,0], arms hanging [0,-1,0], legs [0,-1,0], feet [0,0,1].
The chest and face point along the cross product across x torso_up (standing facing the viewer: [1,0,0] x [0,1,0] = [0,0,1], toward the viewer). Use it to check which way the body faces: tilting torso_up toward the viewer [0,0.3,1] makes the chest face DOWN (a dive or belly-down fall); tilting it away [0,0.3,-1] makes the chest face UP; rotating across to [0,0,-1] turns the character to face screen right.

Reference values (character facing the viewer):
- arm raised straight up [0,1,0]; arm straight out to its own side: left [1,0,0], right [-1,0,0]; arm pointing at the viewer [0,0,1]; arm reaching back [0,0,-1]
- elbow bent 90 degrees forward: upper arm [0,-1,0], forearm [0,0,1]
- leg raised forward [0,0,1] with the shin hanging [0,-1,0] (knee bent 90 degrees); leg out to its own side: left [1,-0.3,0]; leg kicked back [0,-0.3,-1]
- head tipped back to look up: head_up [0,0.6,-0.8]

Be bold and expressive. Use the full range of motion and exaggerate the extremes of the action: wide-spread or whipped limbs, a torso leaning and turning, a head that reacts. Make poses asymmetric when the action is (one arm flung wide, the other reaching; one leg kicked, the other trailing), and symmetric only when the user says so. A fall is not just a lean: the limbs flail, splay and trail in different directions. A suspended or trapped state (caught in a web, held in mid-air) is a star-like splay: arms and legs spread wide apart in different directions, torso tilted, head thrown back, nothing hanging straight down.

Respect human anatomy so the body never deforms:
- elbows bend only one way: the forearm folds toward the front of the upper arm; knees bend only one way: the shin folds backward behind the thigh
- do not point a limb straight through the body, and keep forearm and shin vectors within about 150 degrees of their upper arm or thigh vector
- hips and shoulders stay roughly squared to each other: across and the shoulder line do not rotate against each other

You are given the character's CURRENT pose as segment vectors. The first pose starts from it: change what the description requires and keep the rest. Each later pose starts from the previous one. Every pose must still list ALL segments, including head_up. Return JSON.`;

const vec3 = { type: "ARRAY", items: { type: "NUMBER" }, minItems: 3, maxItems: 3 };

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    poses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          ...Object.fromEntries(SEGMENT_KEYS.map((k) => [k, vec3])),
        },
        required: ["text", ...SEGMENT_KEYS],
      },
    },
  },
  required: ["poses"],
};

function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    v.some((n) => n !== 0)
  );
}

function parseSegments(raw: Record<string, unknown>): PoseSegments | null {
  if (!SEGMENT_KEYS.every((k) => isVec3(raw[k]))) return null;
  return Object.fromEntries(SEGMENT_KEYS.map((k) => [k, raw[k]])) as unknown as PoseSegments;
}

export async function decomposePrompt(
  prompt: string,
  current: PoseSegments | null
): Promise<PlannedPose[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (add it to .env.local).");

  const userText = current
    ? `Current pose:\n${JSON.stringify(current)}\n\nMotion description:\n${prompt}`
    : `Motion description:\n${prompt}`;

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");

  const poses = JSON.parse(text)?.poses;
  if (!Array.isArray(poses) || poses.length === 0) {
    throw new Error("Gemini did not return any poses.");
  }
  return poses.map((p: Record<string, unknown>) => ({
    text: String(p.text),
    segments: parseSegments(p),
  }));
}
