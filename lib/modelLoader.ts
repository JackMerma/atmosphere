import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { unzipSync } from "fflate";

export type ModelKind = "glb" | "gltf" | "fbx";

/**
 * A model file plus anything that shipped alongside it. An archive from
 * Sketchfab keeps its textures in a sibling folder, and the model references
 * them by paths that only made sense on whoever exported it; `assets` maps
 * each file's bare name to its contents so those references can be rerouted.
 */
export interface ModelSource {
  data: ArrayBuffer;
  kind: ModelKind;
  /** Lowercased file name -> data URL, for files that travelled with the model. */
  assets: Map<string, string>;
  /** The model file's own name, for error messages. */
  name: string;
}

const MODEL_EXTENSIONS: ModelKind[] = ["glb", "gltf", "fbx"];

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const baseNameOf = (path: string) => path.split(/[\\/]/).pop()?.toLowerCase() ?? "";

/** Media type for a texture, so a data URL the loaders fetch is read correctly. */
function mediaTypeOf(name: string) {
  const extension = extensionOf(name);
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "ktx2") return "image/ktx2";
  if (extension === "bin") return "application/octet-stream";
  return "image/png";
}

function toDataUrl(bytes: Uint8Array, name: string) {
  let binary = "";
  // Chunked, because spreading a multi-megabyte array blows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mediaTypeOf(name)};base64,${btoa(binary)}`;
}

/**
 * Reads an upload into something the loaders can take: a bare .glb, .gltf or
 * .fbx, or a .zip holding one of those next to its textures.
 */
export function openModel(buffer: ArrayBuffer, fileName: string): ModelSource {
  const kind = extensionOf(fileName);
  if (MODEL_EXTENSIONS.includes(kind as ModelKind)) {
    return { data: buffer, kind: kind as ModelKind, assets: new Map(), name: fileName };
  }
  if (kind !== "zip") {
    throw new Error(`Unsupported file type ".${kind}". Upload a .glb, .gltf, .fbx or .zip.`);
  }

  const entries = Object.entries(unzipSync(new Uint8Array(buffer))).filter(
    // Archive metadata, not content.
    ([path]) => !path.startsWith("__MACOSX/") && !baseNameOf(path).startsWith(".")
  );

  // Prefer the shallowest model file, which in a Sketchfab archive is the one in source/.
  const models = entries
    .filter(([path]) => MODEL_EXTENSIONS.includes(extensionOf(path) as ModelKind))
    .sort((a, b) => a[0].split("/").length - b[0].split("/").length);
  if (models.length === 0) {
    throw new Error("This archive has no .glb, .gltf or .fbx model inside it.");
  }

  const [modelPath, modelBytes] = models[0];
  const assets = new Map<string, string>();
  for (const [path, bytes] of entries) {
    if (path === modelPath || bytes.length === 0) continue;
    assets.set(baseNameOf(path), toDataUrl(bytes, path));
  }

  return {
    data: modelBytes.buffer.slice(
      modelBytes.byteOffset,
      modelBytes.byteOffset + modelBytes.byteLength
    ) as ArrayBuffer,
    kind: extensionOf(modelPath) as ModelKind,
    assets,
    name: modelPath,
  };
}

/**
 * Collapses the duplicate skeletons an FBX with several skinned meshes comes
 * back with.
 *
 * When meshes share one armature, FBXLoader rebuilds the whole bone hierarchy
 * once per mesh and then nests the copies inside each other, so a 95-bone rig
 * arrives as 665 bones with every joint stacked seven deep. Posing the
 * outermost copy would then drag six more along with it. This binds every mesh
 * to the outermost skeleton -- the one whose transforms match the original
 * file -- and cuts the nested duplicates out of the graph.
 */
function unifySkeletons(root: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  const skeletons = new Set(meshes.map((m) => m.skeleton));
  if (skeletons.size < 2) return;

  const depthOf = (o: THREE.Object3D) => {
    let depth = 0;
    for (let p = o.parent; p; p = p.parent) depth++;
    return depth;
  };
  // The outermost copy is the one the file actually positioned.
  const primary = [...skeletons].reduce((best, s) =>
    depthOf(s.bones[0]) < depthOf(best.bones[0]) ? s : best
  );
  if (meshes.some((m) => m.skeleton.bones.length !== primary.bones.length)) return;

  for (const mesh of meshes) {
    if (mesh.skeleton !== primary) mesh.bind(primary, mesh.bindMatrix);
  }

  const keep = new Set(primary.bones);
  for (const bone of primary.bones) {
    for (const child of [...bone.children]) {
      if ((child as THREE.Bone).isBone && !keep.has(child as THREE.Bone)) bone.remove(child);
    }
  }
}

/**
 * Height every model is scaled to, so one camera framing suits them all.
 * Exported because anything reasoning about real-world scale -- a jump's
 * height from how long it hangs in the air, say -- needs to know how a world
 * unit here relates to a metre.
 */
export const TARGET_HEIGHT = 2.6;

/**
 * Puts a freshly loaded model on the same footing as every other: scaled to a
 * standard height, standing on the floor and centred. Exporters disagree wildly
 * on units -- Mixamo's FBX is in centimetres while its GLB is in metres -- and
 * without this a model arrives a hundred times too big for the stage.
 */
function normalize(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 1e-6);
  model.scale.multiplyScalar(TARGET_HEIGHT / height);

  model.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(model);
  const centre = scaled.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(centre.x, scaled.min.y, centre.z));
  model.updateMatrixWorld(true);
}

/** Reroutes texture requests to the files that came in the same archive. */
function managerFor(assets: Map<string, string>) {
  const manager = new THREE.LoadingManager();
  if (assets.size > 0) {
    manager.setURLModifier((url) => assets.get(baseNameOf(url)) ?? url);
  }
  return manager;
}

/** Loads one copy of the model. Call it per copy: the two stage models are independent. */
export function parseModel(source: ModelSource): Promise<THREE.Group> {
  const manager = managerFor(source.assets);

  if (source.kind === "fbx") {
    return new Promise((resolve, reject) => {
      try {
        const object = new FBXLoader(manager).parse(source.data, "");
        unifySkeletons(object);
        normalize(object);
        resolve(object as unknown as THREE.Group);
      } catch (error) {
        reject(
          error instanceof Error
            ? new Error(`Could not read "${source.name}" as an FBX model: ${error.message}`)
            : new Error(`Could not read "${source.name}" as an FBX model.`)
        );
      }
    });
  }

  return new Promise((resolve, reject) => {
    new GLTFLoader(manager).parse(
      source.data,
      "",
      (gltf) => {
        normalize(gltf.scene);
        resolve(gltf.scene);
      },
      (error) =>
        reject(
          error instanceof Error
            ? error
            : new Error(`Could not read "${source.name}" as a .glb/.gltf model.`)
        )
    );
  });
}
