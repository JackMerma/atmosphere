import * as fs from "node:fs";
import * as path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { shimBrowser } from "../checks/fixtures";
import { mapHumanoid } from "@/lib/humanoidRig";

/**
 * Builds the stand-in body that Jev is shown.
 *
 * Every pose Jev judges is photographed on this one figure instead of on
 * whatever the user uploaded. A costume, a hairstyle and a pixel-art texture
 * are all noise in a question that is only ever about where the limbs are, and
 * a fixed body makes judgements comparable between runs and between models.
 * The chosen pose still plays back on the user's own model: poses travel as
 * segment directions, which are rig-independent.
 *
 * The source is one of the harvest animations, stripped to what the question
 * needs: no animation tracks, no textures, one matte material. That also takes
 * it from tens of megabytes of FBX to something a browser can fetch.
 *
 *   npx tsx scripts/mannequin.ts [sourceFile] [outFile]
 */

const ROOT = process.cwd();
const sourceFile = process.argv[2] ?? "Standing Jump.fbx";
const outFile = process.argv[3] ?? "public/mannequin.glb";

/** Flat, light, and unlit enough that no part of the body hides in its own shadow. */
const MANNEQUIN_COLOR = 0xb9b4a8;

/**
 * GLTFExporter reads its finished Blob back through a FileReader, which Node
 * has no global for. Only `readAsArrayBuffer` and `onloadend` are used.
 */
function shimFileReader() {
  const g = globalThis as Record<string, unknown>;
  if (g.FileReader) return;
  g.FileReader = class {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  };
}

async function main() {
  shimBrowser();
  shimFileReader();

  const source = path.join(ROOT, "poses", sourceFile);
  if (!fs.existsSync(source)) {
    console.error(`No such file: poses/${sourceFile}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(source);
  const data = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  const object = new FBXLoader().parse(data, "") as THREE.Object3D & {
    animations: THREE.AnimationClip[];
  };

  // Animation tracks are the bulk of the file and none of the point: the figure
  // is only ever posed by hand from here on.
  object.animations = [];

  const bones: THREE.Bone[] = [];
  object.traverse((o) => {
    if (o instanceof THREE.Bone) bones.push(o);
  });
  try {
    mapHumanoid(bones);
  } catch {
    console.error(`poses/${sourceFile} is not a humanoid rig; pick another file.`);
    process.exit(1);
  }

  // One matte material for the whole body, so what Jev sees is a shape and not
  // a costume. Textures go with it, which is most of the remaining weight.
  const matte = new THREE.MeshStandardMaterial({
    color: MANNEQUIN_COLOR,
    roughness: 0.85,
    metalness: 0,
  });

  let meshes = 0;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of old) material?.dispose?.();
    mesh.material = matte;
  });

  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      object,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true, animations: [], includeCustomExtensions: false }
    );
  });

  const out = path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(glb));

  const before = Math.round(fs.statSync(source).size / 1024 / 1024);
  const after = Math.round(fs.statSync(out).size / 1024);
  console.log(
    `${sourceFile} (${before}MB, ${bones.length} bones, ${meshes} mesh(es)) -> ${outFile} (${after}KB)`
  );
}

main();
