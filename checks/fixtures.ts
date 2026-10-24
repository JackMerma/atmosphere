import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Checks that need a real model read it from `checks/fixtures/`, which is not
 * committed: the models are large and not ours to redistribute. Drop any rigged
 * .glb, .fbx or Sketchfab .zip in there and the checks pick it up by extension.
 */
const DIR = path.join(process.cwd(), "checks", "fixtures");

/** Browser globals the three.js loaders expect; harmless to define under Node. */
export function shimBrowser() {
  const g = globalThis as Record<string, unknown>;
  g.self ??= globalThis;
  g.btoa ??= (s: string) => Buffer.from(s, "binary").toString("base64");
  g.atob ??= (s: string) => Buffer.from(s, "base64").toString("binary");
}

export function readFixture(name: string): ArrayBuffer {
  const file = fs.readFileSync(path.join(DIR, name));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

/** The first fixture with one of these extensions, or null when there is none. */
export function findFixture(...extensions: string[]): string | null {
  if (!fs.existsSync(DIR)) return null;
  return (
    fs
      .readdirSync(DIR)
      .find((name) => extensions.some((ext) => name.toLowerCase().endsWith(ext))) ?? null
  );
}

export function skip(what: string, extensions: string[]) {
  console.log(
    `SKIP  ${what} — put a ${extensions.join(" or ")} model in checks/fixtures/ to run this.`
  );
}
