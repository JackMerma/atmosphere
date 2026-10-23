import { create } from "zustand";
import * as THREE from "three";
import { JointInfo } from "@/lib/gltfJoints";

interface AtmosphereState {
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
