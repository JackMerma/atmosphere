import { create } from "zustand";
import * as THREE from "three";
import { JointInfo } from "@/lib/gltfJoints";
import type { Animation } from "@/lib/animations";
import type { PoseLandmark } from "@/lib/poseEstimation";
import { DEFAULT_SETTINGS, type MotionSettings } from "@/lib/motionSettings";
import type { PoseSegments } from "@/lib/poseRetarget";

/** The two models on stage: where an animation starts and where it ends. */
export type Side = "initial" | "final";

/** Imperative handle onto the 3D canvas, registered by ViewportBridge. */
export interface ViewportApi {
  camera: THREE.Camera;
  /**
   * Renders one model alone (joint dots hidden, the other model hidden), framed
   * whole and centred, as a JPEG data URL. Defaults to the animated stage model.
   * `yaw` swings the shot around the model, in degrees, without moving the
   * camera the user is looking through.
   */
  capture: (side?: Side, yaw?: number) => Promise<string>;
  /**
   * Photographs a pose on the stand-in body instead of the uploaded model, so
   * what Jev judges is a shape rather than a costume. Falls back to the
   * uploaded model when no mannequin has been built.
   */
  captureProxy: (segments: PoseSegments, yaw?: number, side?: Side) => Promise<string>;
  /**
   * Holds the framing of later captures still, widening it to fit the pose on
   * screen now. Without it a capture re-centres on the figure, which subtracts
   * the very rise and fall a strip of frames is meant to show.
   */
  lockFrame: (side: Side, yaw?: number) => void;
  clearFrames: () => void;
}

/** The photo a pose was estimated from, with its detected landmarks. */
export interface PoseReference {
  /** Object URL of the uploaded image; revoked when replaced or cleared. */
  url: string;
  name: string;
  /** Normalized image coordinates (0-1); what the user sees and drags. */
  landmarks: PoseLandmark[];
  /** World landmarks the model pose is solved from; kept in step with `landmarks` when edited. */
  world: PoseLandmark[];
  size: { width: number; height: number };
}

/** A saved pose for one side, plus the photo it was estimated from, if any. */
export interface StateSlot {
  /** Bone rotations (`snapshotPose` order); null = the model's rest pose. */
  quats: number[][] | null;
  name: string | null;
  reference: PoseReference | null;
}

const emptySlot = (): StateSlot => ({ quats: null, name: null, reference: null });

interface AtmosphereState {
  /** Refinement limits, shared by the Motion section and the per-state refine buttons. */
  settings: MotionSettings;
  setSettings: (settings: MotionSettings) => void;
  slots: Record<Side, StateSlot>;
  /** Merges into one side's slot, revoking the previous reference photo's URL if it changed. */
  setSlot: (side: Side, patch: Partial<StateSlot>) => void;
  /**
   * Off by default: one model on stage, no initial/final labels, the planner
   * authors every pose with nothing pinned. On: both stage copies show, with
   * their labels and the magnet transition, and either can be pinned as the
   * animation's start or end.
   */
  dualState: boolean;
  setDualState: (dualState: boolean) => void;
  /** Which of the collapsible side-panel sections is open; opening one closes the other. */
  openPanel: "physics" | "motion" | null;
  setOpenPanel: (panel: "physics" | "motion" | null) => void;
  animations: Animation[];
  activeAnimationId: string | null;
  playing: boolean;
  generating: boolean;
  setGenerating: (generating: boolean) => void;
  /** True while the stage should show one merged figure: playback, or a directed generation. */
  merged: boolean;
  setMerged: (merged: boolean) => void;
  setAnimations: (animations: Animation[]) => void;
  addAnimation: (animation: Animation) => void;
  setActiveAnimation: (id: string) => void;
  removeAnimation: (id: string) => void;
  setPlaying: (playing: boolean) => void;
  viewport: ViewportApi | null;
  capturing: boolean;
  setViewport: (viewport: ViewportApi | null) => void;
  setCapturing: (capturing: boolean) => void;
  /** The initial-state model, left on stage; also the one animations are built and played on. */
  scene: THREE.Group | null;
  /** The final-state model, right on stage. */
  finalScene: THREE.Group | null;
  joints: JointInfo[];
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  isDraggingJoint: boolean;
  setLoading: () => void;
  setModel: (
    scene: THREE.Group,
    finalScene: THREE.Group,
    joints: JointInfo[],
    fileName: string
  ) => void;
  setError: (message: string) => void;
  setDraggingJoint: (dragging: boolean) => void;
}

export const useAtmosphereStore = create<AtmosphereState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: (settings) => set({ settings }),
  slots: { initial: emptySlot(), final: emptySlot() },
  dualState: false,
  setDualState: (dualState) => set({ dualState }),
  openPanel: null,
  setOpenPanel: (openPanel) => set({ openPanel }),
  setSlot: (side, patch) => {
    const previous = get().slots[side];
    if (
      patch.reference !== undefined &&
      previous.reference &&
      previous.reference.url !== patch.reference?.url
    ) {
      URL.revokeObjectURL(previous.reference.url);
    }
    set((state) => ({ slots: { ...state.slots, [side]: { ...state.slots[side], ...patch } } }));
  },
  animations: [],
  activeAnimationId: null,
  playing: false,
  generating: false,
  setGenerating: (generating) =>
    set((s) => ({ generating, playing: generating ? false : s.playing })),
  merged: false,
  setMerged: (merged) => set({ merged }),
  setAnimations: (animations) =>
    set({ animations, activeAnimationId: animations[0]?.id ?? null, playing: false }),
  addAnimation: (animation) =>
    set((s) => ({
      animations: [animation, ...s.animations],
      activeAnimationId: animation.id,
    })),
  setActiveAnimation: (id) => set({ activeAnimationId: id }),
  removeAnimation: (id) =>
    set((s) => {
      const animations = s.animations.filter((a) => a.id !== id);
      const removedActive = s.activeAnimationId === id;
      return {
        animations,
        activeAnimationId: removedActive ? (animations[0]?.id ?? null) : s.activeAnimationId,
        playing: removedActive ? false : s.playing,
      };
    }),
  setPlaying: (playing) => set({ playing }),
  viewport: null,
  capturing: false,
  setViewport: (viewport) => set({ viewport }),
  setCapturing: (capturing) => set({ capturing }),
  scene: null,
  finalScene: null,
  joints: [],
  fileName: null,
  isLoading: false,
  error: null,
  isDraggingJoint: false,
  setLoading: () => set({ isLoading: true, error: null }),
  setModel: (scene, finalScene, joints, fileName) => {
    // The previous model's reference photos and saved poses no longer apply.
    for (const side of ["initial", "final"] as Side[]) {
      get().setSlot(side, { reference: null });
    }
    set({
      scene,
      finalScene,
      joints,
      fileName,
      isLoading: false,
      error: null,
      slots: { initial: emptySlot(), final: emptySlot() },
    });
  },
  setError: (message) =>
    set({
      error: message,
      isLoading: false,
      scene: null,
      finalScene: null,
      joints: [],
      fileName: null,
    }),
  setDraggingJoint: (dragging) => set({ isDraggingJoint: dragging }),
}));
