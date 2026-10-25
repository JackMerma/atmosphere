/**
 * Camera yaws a candidate pose is photographed from, for Jev to judge.
 *
 * One, head-on. It was six, spaced around the full turn, which does catch a
 * limb hidden behind the torso -- but six angles times the poses in a knockout
 * is a lot of rendering, and every one of those images is also a slice of the
 * question Jev is being asked. Starting from one keeps the cost legible while
 * the rest of the pipeline settles; the list is what to grow when the choices
 * start looking wrong for reasons a head-on view would hide.
 */
export const JUDGE_VIEWS = [0];
