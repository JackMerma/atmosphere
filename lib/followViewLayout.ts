/**
 * Where the follow-camera mini-view sits on screen, in CSS pixels -- shared by
 * `FollowCameraView` (which renders into it, inside the WebGL canvas, via a
 * scissored viewport) and the plain HTML border drawn over it. Both need the
 * exact same rectangle, or the frame and the picture inside it drift apart.
 *
 * Anchored to the right-hand control panel's own position (`right-6 top-6
 * w-80` in `page.tsx`) rather than a separate guess at where it sits, so the
 * two stay aligned if the panel's own placement ever changes.
 */
const PANEL_RIGHT = 24; // right-6
const PANEL_TOP = 24; // top-6
const PANEL_WIDTH = 320; // w-80
const GAP = 16;

export const MINI_SIZE = 220;

export interface FollowRect {
  left: number;
  top: number;
  size: number;
}

/** The mini-view's rect in CSS pixels, given the window's current size. */
export function followViewRect(): FollowRect {
  const left = window.innerWidth - PANEL_RIGHT - PANEL_WIDTH - GAP - MINI_SIZE;
  return { left, top: PANEL_TOP, size: MINI_SIZE };
}
