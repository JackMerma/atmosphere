export const DIRECTIONS = {
  up: "Swing the limb toward the top of the image.",
  down: "Swing the limb toward the bottom of the image.",
  left: "Swing the limb toward the left side of the image.",
  right: "Swing the limb toward the right side of the image.",
  toward_viewer: "Swing the limb out of the image, toward the viewer.",
  away_from_viewer: "Swing the limb into the image, away from the viewer.",
} as const;

export type Direction = keyof typeof DIRECTIONS;

export interface StepResult {
  match: number;
  joint: string;
  direction: Direction;
  usage?: { input_tokens: number; output_tokens: number };
}

/**
 * One convergence iteration: asks Jev, in a single call, whether the figure
 * matches the pose (Noul) and — speculatively, since code decides whether to
 * use it — which joint to move and in which direction (two Choices).
 */
export async function askJevForStep(args: {
  imageBase64: string;
  pose: string;
  joints: { name: string; description: string }[];
}): Promise<StepResult> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set (add it to .env.local).");

  const imageRef = crypto.randomUUID();
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "TypeSafe-Danger-Zone-Images": "true",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: { figure_image: imageRef, target_pose: args.pose },
      assets: { [imageRef]: { type: "image", format: "jpg", data_base64: args.imageBase64 } },
      questions: {
        match: {
          type: "noul",
          instructions:
            "Does the posed 3D figure in `figure_image` match the pose described in `target_pose`?",
        },
        joint: {
          type: "choice",
          instructions:
            "The figure in `figure_image` should be moved toward the pose in `target_pose`. " +
            "Which single joint should be rotated next to get closest to that pose?",
          criteria: Object.fromEntries(args.joints.map((j) => [j.name, j.description])),
        },
        direction: {
          type: "choice",
          instructions:
            "The figure in `figure_image` should be moved toward the pose in `target_pose`. " +
            "In which direction, as seen in the image, should the chosen limb swing?",
          criteria: DIRECTIONS,
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  const answers = data?.answers;
  if (
    typeof answers?.match?.noul !== "number" ||
    !answers?.joint?.choice ||
    !answers?.direction?.choice
  ) {
    throw new Error("Jev returned an unexpected response shape.");
  }
  return {
    match: answers.match.noul,
    joint: answers.joint.choice,
    direction: answers.direction.choice,
    usage: data.usage,
  };
}
