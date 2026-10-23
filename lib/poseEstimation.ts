import type { PoseLandmarker } from "@mediapipe/tasks-vision";

/** Must match the installed @mediapipe/tasks-vision version. */
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function getLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "IMAGE",
      numPoses: 1,
    });
  })().catch((err) => {
    landmarkerPromise = null; // allow a retry after a network failure
    throw err;
  });
  return landmarkerPromise;
}

/**
 * Estimates the 3D pose of the person in an image. Returns MediaPipe's 33 world
 * landmarks (metres, origin at the hips; x right, y down, z away from the camera).
 */
export async function estimatePose(file: Blob): Promise<PoseLandmark[]> {
  const landmarker = await getLandmarker();
  const bitmap = await createImageBitmap(file);
  try {
    const result = landmarker.detect(bitmap);
    const world = result.worldLandmarks[0];
    if (!world) throw new Error("No person found in this image.");
    return world;
  } finally {
    bitmap.close();
  }
}
