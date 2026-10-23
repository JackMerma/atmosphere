import { create } from "zustand";
import * as THREE from "three";
import { JointInfo } from "@/lib/gltfJoints";

interface AtmosphereState {
  scene: THREE.Group | null;
  joints: JointInfo[];
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  locked: boolean;
  selectedJointId: string | null;
  setLoading: () => void;
  setModel: (scene: THREE.Group, joints: JointInfo[], fileName: string) => void;
  setError: (message: string) => void;
  toggleLock: () => void;
  setSelectedJoint: (id: string | null) => void;
}

export const useAtmosphereStore = create<AtmosphereState>((set) => ({
  scene: null,
  joints: [],
  fileName: null,
  isLoading: false,
  error: null,
  locked: false,
  selectedJointId: null,
  setLoading: () => set({ isLoading: true, error: null }),
  setModel: (scene, joints, fileName) =>
    set({
      scene,
      joints,
      fileName,
      isLoading: false,
      error: null,
      locked: false,
      selectedJointId: null,
    }),
  setError: (message) =>
    set({
      error: message,
      isLoading: false,
      scene: null,
      joints: [],
      fileName: null,
      locked: false,
      selectedJointId: null,
    }),
  toggleLock: () =>
    set((s) => ({ locked: !s.locked, selectedJointId: s.locked ? null : s.selectedJointId })),
  setSelectedJoint: (id) => set({ selectedJointId: id }),
}));
