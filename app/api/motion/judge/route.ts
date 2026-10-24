import { NextResponse } from "next/server";
import { askJevMatch } from "@/lib/jevClient";

const stripDataUrl = (value: unknown) =>
  typeof value === "string" ? value.replace(/^data:image\/\w+;base64,/, "") : "";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const imageBase64 = stripDataUrl(body?.image);
  const referenceBase64 = stripDataUrl(body?.reference);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!imageBase64 || (!text && !referenceBase64)) {
    return NextResponse.json(
      { error: "image and either text or reference are required." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await askJevMatch({
        imageBase64,
        text: text || undefined,
        referenceBase64: referenceBase64 || undefined,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jev judge failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
