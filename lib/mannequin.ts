import * as THREE from "three";
import { parseModelPair } from "@/lib/gltfJoints";
import { collectBones } from "@/lib/boneMath";
import { applySegmentsToRig, type PoseSegments } from "@/lib/poseRetarget";
import { resetToRest } from "@/lib/pose";
import type { Side } from "@/store/useAtmosphereStore";

/**
 * The stand-in body every candidate pose is photographed on.
 *
 * Jev is never shown the uploaded model. A costume, a hairstyle and a texture
 * are noise in a question that is only ever about where the limbs are, and a
 * fixed body makes one run's judgements comparable with another's. The pose
 * that wins is still applied to the user's own model: poses travel as segment
 * directions, which carry no rig with them.
 *
 * Built by `scripts/mannequin.ts`. When the file is missing the capture falls
 * back to the uploaded model, so a checkout without it still works.
 */
const MANNEQUIN_URL = "/mannequin.glb";

export interface Mannequin {
  /** Its own scene, so nothing about it can reach the one on screen. */
  scene: THREE.Scene;
  model: THREE.Group;
  bones: THREE.Bone[];
}

let pending: Promise<Mannequin | null> | null = null;

async function build(): Promise<Mannequin | null> {
  const res = await fetch(MANNEQUIN_URL);
  if (!res.ok) return null;

  // Parsed by the same path as an upload, so it arrives normalised to the
  // standard height, standing on the floor, with its rest pose and measured
  // joint limits already in place.
  const { scene: model } = await parseModelPair(await res.arrayBuffer(), "mannequin.glb");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f3efe4");
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 5, 3);
  scene.add(key);
  scene.add(model);

  return { scene, model, bones: collectBones(model) };
}

/** Loaded once and kept; null when no mannequin has been built. */
export function loadMannequin(): Promise<Mannequin | null> {
  pending ??= build().catch(() => null);
  return pending;
}

/**
 * Puts the mannequin in `segments` and returns it ready to photograph.
 *
 * Posed from rest rather than from the pose before it, so the picture depends
 * only on the library pose in it. The same pose always produces the same
 * picture, whatever came earlier in the animation.
 */
export function poseMannequin(mannequin: Mannequin, segments: PoseSegments, camera: THREE.Camera) {
  resetToRest(mannequin.bones);
  applySegmentsToRig(mannequin.bones, segments, camera);
  mannequin.model.updateMatrixWorld(true);
}

/** Which side's model a capture falls back to when there is no mannequin. */
export type FallbackSide = Side;
