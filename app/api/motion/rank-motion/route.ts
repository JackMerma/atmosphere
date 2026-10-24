import { NextResponse } from "next/server";
import { askJevRankMotion } from "@/lib/jevClient";

const strip = (value: unknown) =>
  typeof value === "string" ? value.replace(/^data:image\/\w+;base64,/, "") : "";

/**
 * Asks Jev which of several ways of playing the same poses reads best as
 * motion. Each candidate is a set of strips -- one per camera angle -- of
 * frames taken in time order.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const candidates: string[][] = Array.isArray(body?.candidates)
    ? body.candidates.map((strips: unknown) =>
        (Array.isArray(strips) ? strips : []).map(strip).filter(Boolean)
      )
    : [];
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (candidates.length < 2 || candidates.some((strips) => strips.length === 0)) {
    return NextResponse.json(
      { error: "At least two candidates, each with a strip, are required." },
      { status: 400 }
    );
  }
  if (!text) {
    return NextResponse.json({ error: "The motion being judged must be described." }, { status: 400 });
  }

  try {
    return NextResponse.json(await askJevRankMotion({ candidates, text }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jev motion ranking failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
