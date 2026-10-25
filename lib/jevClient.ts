/**
 * The one question this app asks Jev: given several pictures of a posed figure,
 * which one best matches a written description.
 *
 * Nothing else. Scoring a pose on its own was tried and dropped -- Jev's
 * absolute scores sit low and barely move, so anything built on them is close
 * to random. Picking a winner only needs it to see which picture is closer,
 * which it does reliably.
 */
interface Asset {
  type: "image";
  format: string;
  data_base64: string;
}

/**
 * Asks Jev which of several candidates best matches a target, as a single
 * Choice between them.
 *
 * Each candidate may carry more than one image of itself, which Jev is told to
 * read as several views of the same figure rather than as separate options.
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
