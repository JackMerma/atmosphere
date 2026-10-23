import { NextResponse } from "next/server";
import { decomposePrompt } from "@/lib/geminiClient";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Describe a motion first." }, { status: 400 });
  }

  try {
    return NextResponse.json({ poses: await decomposePrompt(prompt) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not decompose the prompt.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
