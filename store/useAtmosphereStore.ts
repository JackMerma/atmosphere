import { create } from "zustand";
import * as THREE from "three";
import { JointInfo } from "@/lib/gltfJoints";

/** Imperative handle onto the 3D canvas, registered by ViewportBridge. */
export interface ViewportApi {
  camera: THREE.Camera;
  /** Renders the model (joint dots hidden), cropped around it, as a JPEG data URL. */
  capture: () => Promise<string>;
}

interface AtmosphereState {
  viewport: ViewportApi | null;
  capturing: boolean;
  setViewport: (viewport: ViewportApi | null) => void;
  setCapturing: (capturing: boolean) => void;
  scene: THREE.Group | null;
  joints: JointInfo[];
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  isDraggingJoint: boolean;
  setLoading: () => void;
  setModel: (scene: THREE.Group, joints: JointInfo[], fileName: string) => void;
  setError: (message: string) => void;
  setDraggingJoint: (dragging: boolean) => void;
}

export const useAtmosphereStore = create<AtmosphereState>((set) => ({
  viewport: null,
  capturing: false,
  setViewport: (viewport) => set({ viewport }),
  setCapturing: (capturing) => set({ capturing }),
  scene: null,
  joints: [],
  fileName: null,
  isLoading: false,
  error: null,
  isDraggingJoint: false,
  setLoading: () => set({ isLoading: true, error: null }),
  setModel: (scene, joints, fileName) =>
    set({ scene, joints, fileName, isLoading: false, error: null }),
  setError: (message) =>
    set({
      error: message,
      isLoading: false,
      scene: null,
      joints: [],
      fileName: null,
    }),
  setDraggingJoint: (dragging) => set({ isDraggingJoint: dragging }),
}));
