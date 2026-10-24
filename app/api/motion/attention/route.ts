import { NextResponse } from "next/server";
import { askJevAttention } from "@/lib/jevClient";

const strip = (value: unknown) =>
  typeof value === "string" ? value.replace(/^data:image\/\w+;base64,/, "") : "";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const views: string[] = (Array.isArray(body?.views) ? body.views : []).map(strip).filter(Boolean);
  const referenceBase64 = strip(body?.reference);

  if (views.length === 0 || !referenceBase64) {
    return NextResponse.json({ error: "views and reference are required." }, { status: 400 });
  }

  try {
    return NextResponse.json(await askJevAttention({ views, referenceBase64 }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jev attention failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
