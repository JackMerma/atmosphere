/**
 * Camera yaws a candidate is judged from, shared by pose ranking, photo
 * attention and motion ranking so the three agree on what "judged from several
 * angles" means instead of drifting apart.
 *
 * A single view hides whatever axis it looks straight down. Head-on, that is
 * front-to-back -- exactly the axis a walk, a reach or a kick usually lives on
 * -- which is why this was two views (0 and 55) even before it was six: a
 * three-quarter view makes that axis visible. But two views still never show
 * the body in profile or from behind, so a limb hidden behind the torso from
 * both of them is invisible to the judge however wrong it is.
 *
 * Six, spaced evenly around the full turn, put every part of the body in
 * profile from at least one view, including the back. The trade is real: this
 * triples the images judged in every call that uses it (and, for a motion
 * sheet, each of those images is itself a grid of frames), so it also triples
 * roughly how many tokens and how long each one takes.
 */
export const JUDGE_VIEWS = [0, 60, 120, 180, 240, 300];

/**
 * The same six angles, every other one, for the one place six is too many: a
 * motion sheet already bundles several time-samples into each image, so giving
 * it six camera angles too multiplies to a request Jev's own endpoint refuses
 * outright (`max_tokens_exceeded`, hit against the real API at four candidates
 * x six angles x six frames = 24 images, 1.7MB). Three keeps three evenly
 * spaced views -- still three times today's single blind axis -- at a payload
 * confirmed to go through.
 */
export const MOTION_VIEWS = JUDGE_VIEWS.filter((_, i) => i % 2 === 0);
