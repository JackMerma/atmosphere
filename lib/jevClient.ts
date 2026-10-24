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
