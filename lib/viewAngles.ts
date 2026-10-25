/**
 * Camera yaws a candidate pose is photographed from, for Jev to judge.
 *
 * Four, a quarter-turn apart: front, right, back, left. One angle alone (what
 * this started as) hid anything behind the torso from the camera -- a crouch
 * read as standing, because the whole difference was in depth. Opposite pairs
 * (0/180, 90/270) are deliberate: between them every limb is seen edge-on from
 * at least one angle and in profile from another, so nothing the body is doing
 * is invisible from all four.
 *
 * The cost is real and linear in this count: one captureProxy render per view
 * per candidate, and the same number of images in every Jev call. Four was
 * chosen over the eight-or-so a full ring would take because the cost already
 * multiplies against `rankedPoses` and `optionsPerQuery` in `motionSettings.ts`
 * -- grow this list with that in mind.
 */
export const JUDGE_VIEWS = [0, 90, 180, 270];
