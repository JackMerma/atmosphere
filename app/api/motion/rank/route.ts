import { NextResponse } from "next/server";
import { askJevRank } from "@/lib/jevClient";

const strip = (value: unknown) =>
  typeof value === "string" ? value.replace(/^data:image\/\w+;base64,/, "") : "";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const candidates: string[][] = Array.isArray(body?.candidates)
    ? body.candidates.map((views: unknown) =>
        (Array.isArray(views) ? views : []).map(strip).filter(Boolean)
      )
    : [];
  const referenceBase64 = strip(body?.reference);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (candidates.length < 2 || candidates.some((views) => views.length === 0)) {
    return NextResponse.json(
      { error: "At least two candidates, each with a view, are required." },
      { status: 400 }
    );
  }
  if (!text && !referenceBase64) {
    return NextResponse.json({ error: "Either text or reference is required." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await askJevRank({
        candidates,
        text: text || undefined,
        referenceBase64: referenceBase64 || undefined,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jev ranking failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
