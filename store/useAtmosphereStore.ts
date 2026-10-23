import { create } from "zustand";
import * as THREE from "three";
import { JointInfo } from "@/lib/gltfJoints";
import type { Animation } from "@/lib/animations";

/** Imperative handle onto the 3D canvas, registered by ViewportBridge. */
export interface ViewportApi {
  camera: THREE.Camera;
  /** Renders the model (joint dots hidden), cropped around it, as a JPEG data URL. */
  capture: () => Promise<string>;
}

interface AtmosphereState {
  /** Bone rotations (convergence.ts `snapshot` order) Motion starts from; null = rest pose. */
  initialState: number[][] | null;
  initialStateName: string | null;
  setInitialState: (quats: number[][] | null, name?: string | null) => void;
  animations: Animation[];
  activeAnimationId: string | null;
  playing: boolean;
  generating: boolean;
  setGenerating: (generating: boolean) => void;
  setAnimations: (animations: Animation[]) => void;
  addAnimation: (animation: Animation) => void;
  setActiveAnimation: (id: string) => void;
  setPlaying: (playing: boolean) => void;
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
  initialState: null,
  initialStateName: null,
  setInitialState: (quats, name = null) =>
    set({ initialState: quats, initialStateName: quats ? name : null }),
  animations: [],
  activeAnimationId: null,
  playing: false,
  generating: false,
  setGenerating: (generating) =>
    set((s) => ({ generating, playing: generating ? false : s.playing })),
  setAnimations: (animations) =>
    set({ animations, activeAnimationId: animations[0]?.id ?? null, playing: false }),
  addAnimation: (animation) =>
    set((s) => ({
      animations: [animation, ...s.animations],
      activeAnimationId: animation.id,
    })),
  setActiveAnimation: (id) => set({ activeAnimationId: id }),
  setPlaying: (playing) => set({ playing }),
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
    set({
      scene,
      joints,
      fileName,
      isLoading: false,
      error: null,
      initialState: null,
      initialStateName: null,
    }),
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
