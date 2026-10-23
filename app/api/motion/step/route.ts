import { NextResponse } from "next/server";
import { askJevForStep } from "@/lib/jevClient";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const image = typeof body?.image === "string" ? body.image : "";
  const pose = typeof body?.pose === "string" ? body.pose.trim() : "";
  const joints = Array.isArray(body?.joints) ? body.joints : [];

  const imageBase64 = image.replace(/^data:image\/\w+;base64,/, "");
  if (!imageBase64 || !pose || joints.length === 0) {
    return NextResponse.json({ error: "image, pose and joints are required." }, { status: 400 });
  }

  try {
    return NextResponse.json(await askJevForStep({ imageBase64, pose, joints }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jev step failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
