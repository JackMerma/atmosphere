import { create } from "zustand";

/**
 * One image exactly as it was captured and handed to Jev, with enough context
 * to read what it was for.
 */
export interface FilmFrame {
  /** The planner's description of the pose being chosen when this was shot. */
  poseText: string;
  /** Which library pose this is a photograph of. */
  candidateLabel: string;
  /** How far this candidate measured from the target, in degrees. */
  distance: number;
  /** Camera yaw, degrees -- which of `JUDGE_VIEWS` this is. */
  yaw: number;
  /** The exact data URL sent to Jev. */
  image: string;
}

interface DebugFilmState {
  frames: FilmFrame[];
  push: (frame: FilmFrame) => void;
  clear: () => void;
}

/**
 * Every image captured for Jev during the current (or most recent) generation,
 * in the order they were taken -- the "what is actually being sent" debug
 * strip. A plain, separate store rather than a slice of the main one: nothing
 * about posing or playback needs to read it, and clearing it on every
 * Generate should not be bundled with anything else that resets.
 */
export const useDebugFilm = create<DebugFilmState>((set) => ({
  frames: [],
  push: (frame) => set((s) => ({ frames: [...s.frames, frame] })),
  clear: () => set({ frames: [] }),
}));
