# Status

Where the project stands, honestly. Written to pick the work back up later.

Last worked on: 24 October 2026. Head of `master`: the motion-judging work.

## What is verified

Checked by the numeric checks in `checks/` (see [`checks.md`](checks.md)), all
passing, plus a run in the browser against two real models.

- **Anatomical limits** hold, and the strength dial is monotone: a knee asked
  to twist 120° gives 35° at full strength, 108° at half, 120° at zero.
- **Self-collision** separates limbs that have sunk into the torso, leaves a
  legal pose untouched, and still acts with the limits switched off.
- **Chain coupling** on a drag: forearm 31°, shoulder 22°, chest 1.4°, hips 0°.
- **Mirroring** a walk contact swaps the legs front for back and keeps the arms
  opposite; mirroring twice is the identity.
- **Attention** on "raise the right arm" selects the right arm and nothing else,
  and reorders the candidate queue to try it first.
- **Grounding**: the feet stay on the floor through a crouch while the hips drop
  1.54 → 1.16, deeper crouches drop further, straightening lifts the body back.
- **Formats**: `.glb`, `.fbx` and a Sketchfab `.zip` all load, normalise to the
  same height, and are recognised as humanoids; the two stage copies share no
  bone and no material.
- **The planner** returns well-formed plans, and gets the structural flags right
  on its own: `mirrorHalf` true for walking and running, false for waving one
  hand; `grounded` false only at the peak of a jump.
- **The motion dials**: every keyframe is still reached bit-for-bit, amplitude
  is monotone and exact at 1, the arm dials leave the legs untouched, the drag
  delays a joint by exactly its chain depth, and spacing changes the middle of a
  segment but not its ends.
- **Judging motion works end to end** against the real API: six frames of an
  animation on one sheet, from a frame held still, ranked by Jev. On "walking"
  over six rounds it widened the arm swing (1.00 -> 1.40), deepened the drag
  (0.03 -> 0.08) and pulled the timing early (spacing 1.00 -> 0.70), leaving
  amplitude and the bob where they were. Playback reads the result.
- **Foot planting**: the planted foot does not slide across the ground, measured
  in the ground's own frame over three stances with a worst slip of 0.016
  against a body height of 2.6. A walk strides 0.91 along one axis; standing
  still and an airborne motion travel nothing; repeats carry the travel on
  rather than snapping back at the seam. Seen in the browser: the ground slides
  under a figure that stays framed.

## What is weak, and known

Ordered by how much it costs the result.

1. **No contact shadow.** A blurred shadow under the planted foot sells weight
   more cheaply than any pose fix, and there is none. The figure reads as
   hovering a little even now that it walks. **The cheapest win left.**
2. **No secondary motion of its own.** Pelvis and spine counter-rotation and
   head stabilisation are formulas, not API calls, and they are most of what
   separates four poses interpolated from something animated. The drag between
   joints is the only part of this that exists.
3. **The travel curve is measured, not exact.** It is sampled at 48 a second and
   read back by interpolation, so a planted foot slips by up to about 0.6% of a
   body height between samples. Invisible, but it is why the check's tolerance
   is not zero.
4. **Jev has not been shown to improve a POSE.** The pose ranking is monotone by
   construction, but no with/without comparison has been run. `Pose rounds = 0`
   exists precisely to make that comparison possible. The motion ranking, by
   contrast, has now been shown to move the dials in directions that match the
   known weaknesses — but with four poses to judge, not against a human eye.
5. **A large FBX freezes the page** for seconds while it parses. Cloning the
   second copy halved it; a worker would fix it properly.
6. **Depth from photos is unreliable.** MediaPipe's z is noisy, which is what
   the structured "mirror the limb's depth" candidates exist to repair.

Two things that were on this list are now Jev's problem rather than open
questions: the **bob strength** and the **arm swing** are dials it searches, and
on "walking" it widened the arms itself — the fix the planner's system prompt
had failed to make.

## Not covered

- A rig that is not humanoid: limits, collision, grounding and the planner all
  no-op or refuse. Dragging still works.
- Playback of animations saved by the pre-timeline pipeline is supported but
  untested since the rewrite.
- The Sketchfab `.zip` path has only been exercised under Node, not through the
  browser upload (the file is larger than the test harness can upload).

## The road ahead

The judgement reached with the user on 24 October stands: **this architecture —
an LLM writing static poses, interpolated, with Jev polishing — has a ceiling,
and we are near it.** Mixamo's animations look good because they are motion
capture of real people: every frame carries correct timing, weight and balance,
at 30–60 fps. Four keyframes slerped together cannot reach that, and judging the
motion instead of the poses does not change it — it tunes how the four are
played, it does not add a fifth.

What the diagnosis actually said, and still says: the bottleneck is not pose
accuracy. It is that there are four poses where there should be sixty, and that
until recently nothing in the system knew about weight, travel or timing. What
the eye reads as real motion, in order of impact:

1. ~~**Travel**~~ — done: the planted foot slides the ground instead of skating.
2. **Contact shadow**, and the floor and light around it. **Next.**
3. **Secondary motion** — counter-rotation, head stabilisation, overlap.
4. **Overshoot and anticipation** — passing the pose and coming back.

The user chose on 24 October to keep the generating architecture and lift Jev
from poses to motion rather than switch to composing mocap. That is done. The
two routes left on the table if the result still does not impress:

- a **mocap clip library** the planner composes from, with Jev selecting clips
  by name (a text Choice, which is well posed) and verifying the composition
  from a sheet of frames exactly as it does now. Looks like Mixamo because it is
  Mixamo, and changes the project from generating motion to directing it.
- a **text-to-motion model** such as MDM — needs a GPU backend and sidelines Jev.

## Hackathon state

The build checklist in `devpost/checklist.md` has all six slices ticked. The
final review, the learning wrap-up and the app map are **not** done, and `6-ship`
— demo video, public repo, Devpost submission — has not been started. As of 24
October the user put the deadline at **2–3 days**, which is enough for the two
cheap wins above and `6-ship`, and not enough for a mocap library.
