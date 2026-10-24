import { NextResponse } from "next/server";
import { planMotion } from "@/lib/plannerClient";
import type { PoseSegments } from "@/lib/poseRetarget";

const isPose = (v: unknown): v is PoseSegments =>
  !!v && typeof v === "object" && "across" in v && "torso_up" in v;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Describe the motion first." }, { status: 400 });
  }
  if (!isPose(body?.start) || !isPose(body?.end)) {
    return NextResponse.json(
      { error: "The start and end poses could not be read from this model." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await planMotion(prompt, body.start, body.end));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not plan the motion.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
