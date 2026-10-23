const DEFAULT_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT =
  "Split the user's motion description into an ordered list of short, self-contained " +
  "static pose descriptions (one per described state, in order). Describe each pose as a " +
  "body position only, with no transitions. Return JSON.";

export async function decomposePrompt(prompt: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (add it to .env.local).");

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { poses: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["poses"],
          },
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
  return poses.map(String);
}
