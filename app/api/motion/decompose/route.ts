import { NextResponse } from "next/server";
import { decomposePrompt } from "@/lib/geminiClient";
import type { PoseSegments } from "@/lib/poseRetarget";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Describe a motion first." }, { status: 400 });
  }
  // The model's current pose, when its skeleton could be read; Gemini starts from it.
  const current: PoseSegments | null =
    body?.current && typeof body.current === "object" ? body.current : null;

  try {
    return NextResponse.json({ poses: await decomposePrompt(prompt, current) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not decompose the prompt.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
