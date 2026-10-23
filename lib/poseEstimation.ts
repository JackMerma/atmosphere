import type { PoseLandmarker } from "@mediapipe/tasks-vision";

/** Must match the installed @mediapipe/tasks-vision version. */
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task";

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/**
 * MediaPipe prints "INFO: ..." lines through console.error, which the Next.js
 * dev overlay reports as a crash. Drop only those lines while it runs.
 */
async function withoutMediapipeInfo<T>(fn: () => T | Promise<T>): Promise<T> {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    original.apply(console, args);
  };
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function getLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    return withoutMediapipeInfo(() =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        numPoses: 1,
        // Looser than the defaults so stylised or partly occluded figures are still found.
        minPoseDetectionConfidence: 0.3,
        minPosePresenceConfidence: 0.3,
      })
    );
  })().catch((err) => {
    landmarkerPromise = null; // allow a retry after a network failure
    throw err;
  });
  return landmarkerPromise;
}

export interface EstimatedPose {
  /** 33 world landmarks: metres, origin at the hips; x right, y down, z away from the camera. */
  world: PoseLandmark[];
  /** The same 33 landmarks in normalized image coordinates (0-1), for drawing over the photo. */
  image: PoseLandmark[];
  /** Pixel size of the source image, to turn normalized coordinates into real distances. */
  size: { width: number; height: number };
}

/** Estimates the pose of the person in an image with MediaPipe. */
export async function estimatePose(file: Blob): Promise<EstimatedPose> {
  const landmarker = await getLandmarker();
  const bitmap = await createImageBitmap(file);
  try {
    const result = await withoutMediapipeInfo(() => landmarker.detect(bitmap));
    const world = result.worldLandmarks[0];
    const image = result.landmarks[0];
    if (!world || !image) throw new Error("No person found in this image.");
    return { world, image, size: { width: bitmap.width, height: bitmap.height } };
  } finally {
    bitmap.close();
  }
}
