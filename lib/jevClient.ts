/**
 * Asks Jev, with a Noul, how well a rendered figure matches a target: either a
 * written pose description or a reference photo of a person. Returns 0..1.
 * Jev scores conservatively, so callers should compare candidates against each
 * other rather than against an absolute bar.
 */
export async function askJevMatch(args: {
  imageBase64: string;
  /** Written description of the target pose. */
  text?: string;
  /** Base64 JPEG/PNG of a photo whose body pose is the target. */
  referenceBase64?: string;
}): Promise<{ match: number; usage?: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set (add it to .env.local).");
  if (!args.text && !args.referenceBase64) throw new Error("Nothing to compare the figure to.");

  const figureRef = crypto.randomUUID();
  const referenceRef = crypto.randomUUID();
  const assets: Record<string, { type: "image"; format: string; data_base64: string }> = {
    [figureRef]: { type: "image", format: "jpg", data_base64: args.imageBase64 },
  };
  const state: Record<string, string> = { figure_image: figureRef };

  let instructions: string;
  if (args.referenceBase64) {
    assets[referenceRef] = { type: "image", format: "jpg", data_base64: args.referenceBase64 };
    state.reference_photo = referenceRef;
    instructions =
      "Does the body pose of the 3D figure in `figure_image` match the body pose of the " +
      "person in `reference_photo`? Compare where the arms, legs, torso and head point. " +
      "Ignore clothing, style, identity and camera framing.";
  } else {
    state.target_pose = args.text!;
    instructions =
      "Does the posed 3D figure in `figure_image` match the pose described in `target_pose`?";
  }

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "TypeSafe-Danger-Zone-Images": "true",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state,
      assets,
      questions: { match: { type: "noul", instructions } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const match = data?.answers?.match?.noul;
  if (typeof match !== "number") throw new Error("Jev returned an unexpected response shape.");
  return { match, usage: data.usage };
}

interface Asset {
  type: "image";
  format: string;
  data_base64: string;
}

/**
 * Asks Jev which of several candidates best matches a target, as a single
 * Choice between them.
 *
 * Ranking beats scoring here. Jev's absolute scores sit low and barely move, so
 * hill-climbing on them is close to random; asked to pick a winner it only has
 * to see which picture is closer, which it does reliably. One call replaces one
 * per candidate, and the caller passes what it already has in as a candidate,
 * so the answer can never be worse than where it started.
 *
 * Each candidate is given from several angles, because the axis a motion lives
 * on is often the one the camera is looking down.
 */
async function askJevChoice(args: {
  /** One entry per candidate, each a list of base64 images of that candidate. */
  candidates: string[][];
  /** What every candidate is a view of, as Jev should read it. */
  subject: string;
  /** How to judge them, ending in the question. */
  instructions: string;
  /** Written description of what they are all aiming at. */
  text?: string;
  /** Base64 photo whose body pose they are all aiming at. */
  referenceBase64?: string;
}): Promise<{ best: number; usage?: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set (add it to .env.local).");
  if (args.candidates.length === 0) throw new Error("No candidates to rank.");
  if (!args.text && !args.referenceBase64) throw new Error("Nothing to compare the figures to.");

  const assets: Record<string, Asset> = {};
  const options: Record<string, string[]> = {};
  const criteria: Record<string, string> = {};

  args.candidates.forEach((views, i) => {
    const name = `option_${i + 1}`;
    options[name] = views.map((view) => {
      const ref = crypto.randomUUID();
      assets[ref] = { type: "image", format: "jpg", data_base64: view };
      return ref;
    });
    criteria[name] =
      `The ${args.subject} shown in the ${views.length} images listed under \`options.${name}\`.`;
  });

  const state: Record<string, unknown> = { options };
  let instructions = args.instructions + " ";

  if (args.referenceBase64) {
    const ref = crypto.randomUUID();
    assets[ref] = { type: "image", format: "jpg", data_base64: args.referenceBase64 };
    state.reference_photo = ref;
    instructions +=
      "Which option's body pose is closest to the pose of the person in `reference_photo`? " +
      "Ignore clothing, style, identity and camera framing.";
  } else {
    state.target_pose = args.text!;
    instructions += "Which option best matches `target_pose`?";
  }

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "TypeSafe-Danger-Zone-Images": "true",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state,
      assets,
      questions: { best: { type: "choice", instructions, criteria } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const choice: string | undefined = data?.answers?.best?.choice;
  const index = choice ? Number(choice.replace("option_", "")) - 1 : NaN;
  if (!Number.isInteger(index) || index < 0 || index >= args.candidates.length) {
    throw new Error("Jev returned an unexpected choice.");
  }
  return { best: index, usage: data.usage };
}

/** Asks Jev which candidate POSE is closest to the target. */
export function askJevRank(args: {
  candidates: string[][];
  text?: string;
  referenceBase64?: string;
}) {
  return askJevChoice({
    ...args,
    subject: "figure",
    instructions:
      "Each option shows the same 3D figure in a different pose, from several camera angles. " +
      "Judge every option across all of its views, paying attention to which way the arms and " +
      "legs point front-to-back, which a single head-on view hides.",
  });
}

/**
 * Asks Jev which candidate MOTION reads best, from strips of frames.
 *
 * A pose can be judged from a picture; motion cannot, and Jev is given no
 * video. A strip is the way round it: each option is the same animation laid
 * out as numbered frames in order, so weight, timing and whether the feet
 * actually pass each other are all visible in a still image. The options
 * differ only in how the motion is played -- the poses in them are the same --
 * so what is being asked about is the movement and nothing else.
 */
export function askJevRankMotion(args: { candidates: string[][]; text: string }) {
  return askJevChoice({
    ...args,
    subject: "animation",
    instructions:
      "Each option is a sheet of frames from one animation of the same 3D figure, numbered in " +
      "time order and read left to right then down, all shot from a fixed camera so the " +
      "figure's height in the frame is its real height. The options show the same poses " +
      "played differently: how " +
      "far each pose is committed to, how much the limbs trail behind the body, how the body " +
      "rises and falls, and how the time between poses is spent. Judge the movement, not the " +
      "picture quality: does the weight shift believably, do the limbs lead and follow instead " +
      "of arriving together, and does the figure look like a body doing this rather than a " +
      "mannequin being posed?",
  });
}

/** Body parts attention is directed at; the names Jev is asked to choose between. */
export const BODY_PARTS = [
  "left arm",
  "right arm",
  "left leg",
  "right leg",
  "head",
  "torso",
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

/**
 * Asks Jev which part of the figure is furthest from the target, so the search
 * can spend its candidates where the pose is actually wrong.
 *
 * This is only worth asking when the target is a photo. When it is a written
 * pose the planner also supplied the exact direction every limb should point,
 * and comparing against that is both free and more precise than any judgement
 * from a picture.
 */
export async function askJevAttention(args: {
  /** Views of the figure as it currently stands. */
  views: string[];
  referenceBase64: string;
}): Promise<{ part: BodyPart; usage?: { input_tokens: number; output_tokens: number } }> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set (add it to .env.local).");
  if (args.views.length === 0) throw new Error("No views of the figure to look at.");

  const assets: Record<string, Asset> = {};
  const figure = args.views.map((view) => {
    const ref = crypto.randomUUID();
    assets[ref] = { type: "image", format: "jpg", data_base64: view };
    return ref;
  });
  const reference = crypto.randomUUID();
  assets[reference] = { type: "image", format: "jpg", data_base64: args.referenceBase64 };

  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "TypeSafe-Danger-Zone-Images": "true",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: { figure_views: figure, reference_photo: reference },
      assets,
      questions: {
        part: {
          type: "choice",
          instructions:
            "`figure_views` shows a posed 3D figure from several angles, and `reference_photo` " +
            "shows the pose it is meant to be holding. Which part of the figure's body is " +
            "furthest from the reference? Judge where each part points, not its shape or size.",
          criteria: Object.fromEntries(
            BODY_PARTS.map((part) => [part.replace(" ", "_"), `The figure's ${part}.`])
          ),
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const choice: string | undefined = data?.answers?.part?.choice;
  const part = choice?.replace("_", " ") as BodyPart | undefined;
  if (!part || !BODY_PARTS.includes(part)) {
    throw new Error("Jev returned an unexpected body part.");
  }
  return { part, usage: data.usage };
}
