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
  if (!isPose(body?.rest)) {
    return NextResponse.json(
      { error: "This model's pose could not be read as a humanoid skeleton." },
      { status: 400 }
    );
  }

  try {
    const pinned = {
      start: isPose(body?.start) ? body.start : undefined,
      end: isPose(body?.end) ? body.end : undefined,
    };
    return NextResponse.json(await planMotion(prompt, body.rest, pinned));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not plan the motion.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
