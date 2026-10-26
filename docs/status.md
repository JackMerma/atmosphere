# Status

Where the project stands, honestly. Written to pick the work back up later.

Last worked on: 26 October 2026 — the day it was submitted. Head of `master`:
the planning docs and the build checklist, rewritten around the pose-library +
Jev-judge pipeline, with the final review, the learning wrap-up and the app map
closed out.

The code itself is unchanged since the UI/debug polish of 25 October — a live
debug filmstrip, an exclusive Physics/Motion accordion, AI-named animation
titles, new default dials, the config panel with no scroll, the camera staying
responsive during generation, and a follow-camera picture-in-picture mini-view
during playback.

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
- **The debug filmstrip** fills in live during a real generation ("Standing
  jump", 25 ranked, 4 per query, 5 batches) and groups correctly by pose and
  candidate; confirmed against a 600-image strip.
- **The camera stays usable during generation.** `OrbitControls` was never
  actually gated on `generating` — the apparent lock-up was the main thread
  being pinned by a synchronous capture burst, fixed with a yield point
  between candidates; confirmed by orbiting mid-generation.
- **The follow-camera mini-view** appears only while playing, tracks a real
  jump's vertical arc (figure stayed centred and front-on here while the main
  free-orbit camera lost it off-frame), and disappears instantly on Stop.
  Verified again after a pixel-ratio bug fix, at `devicePixelRatio=2.5` (the
  test machine's own real scaling) — no second physical monitor was available
  to confirm the original dual-monitor report against directly.
- **The config panel has no scroll**, confirmed via its computed
  `overflow-y: visible` and a `scrollHeight` that already fits its
  `clientHeight` at a normal viewport size.

## What is weak, and known

Ordered by how much it costs the result.

1. **The figure walks in place.** The feet rise and fall correctly, but nothing
   pins them front-to-back during a stance phase, so a walk skates and the
   character never travels. This is the same rule as grounding, on the
   horizontal axis — whichever foot is planted stays put in world space, which
   pushes the body forward. **The biggest single visual win left, and it is one
   rule.**
2. **No contact shadow.** A blurred shadow under the planted foot sells weight
   more cheaply than any pose fix, and there is none.
3. **No secondary motion of its own.** Pelvis and spine counter-rotation and
   head stabilisation are formulas, not API calls, and they are most of what
   separates four poses interpolated from something animated. The drag between
   joints is the only part of this that exists.
4. **The vocabulary is thin where it matters.** 296 poses from 13 animations,
   but 36% of it is two long clips (Breakdance, Looking Through Files) and there
   is **no walking animation at all** — Jogging is the nearest thing. A standing
   target lands 9.3deg away, which is excellent; a jump beat lands 34–43deg,
   which is the right animation but a loose fit. This is fixed with data, not
   code: drop more `.fbx` in `poses/` and re-run `npx tsx scripts/harvest.ts`.
5. **Jev has not been shown to improve a POSE.** The pose ranking is monotone by
   construction, but no with/without comparison has been run. `Pose rounds = 0`
   exists precisely to make that comparison possible. The motion ranking, by
   contrast, has now been shown to move the dials in directions that match the
   known weaknesses — but with four poses to judge, not against a human eye.
6. **A large FBX freezes the page** for seconds while it parses. Cloning the
   second copy halved it; a worker would fix it properly.
7. **Depth from photos is unreliable.** MediaPipe's z is noisy, which is what
   the structured "mirror the limb's depth" candidates exist to repair.
8. **The Physics/Motion dials aren't self-explanatory.** Six sliders (joint
   limits, chain reaction, collision, ranked poses, options per query,
   batches) with no in-app explanation of what moving one actually does to the
   result — confirmed in a 25 October kick-the-tires pass: a first-time user
   wouldn't know how to tune them well from the UI alone, even though the
   shipped defaults already produce a good result.
9. **More elaborate, "produced" prompts can return an incoherent animation.**
   Simple single actions (jump, sit, walk) were confirmed to work well in the
   same pass; a more ambitious, multi-beat prompt is more likely to land on a
   pose sequence that doesn't read as one coherent motion — consistent with
   item 4 above (the vocabulary is thin outside a few well-covered actions).
10. **The UI isn't responsive outside laptop-sized viewports**, and working
    directly with some 3D models' joints showed real limits during that same
    pass that weren't fully characterized — worth a closer look if it recurs,
    but not reproduced in enough detail here to describe precisely.

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
- The follow-camera pixel-ratio fix was confirmed against a real
  `devicePixelRatio=2.5` on the one development machine, not against an actual
  second physical monitor — if the dual-monitor report recurs, that is the
  next thing to check.

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

1. **Travel** — the figure crossing the floor instead of pedalling in place.
2. **Contact shadow**, and the floor and light around it.
3. **Secondary motion** — counter-rotation, head stabilisation, overlap.
4. **Overshoot and anticipation** — passing the pose and coming back.

Of those, only part of 3 exists. **1 and 2 are the next work**, and both are
cheap. They also help under any later direction, which is why they come first.

The user chose on 24 October to keep the generating architecture and lift Jev
from poses to motion rather than switch to composing mocap. That is done. The
two routes left on the table if the result still does not impress:

- a **mocap clip library** the planner composes from, with Jev selecting clips
  by name (a text Choice, which is well posed) and verifying the composition
  from a sheet of frames exactly as it does now. Looks like Mixamo because it is
  Mixamo, and changes the project from generating motion to directing it.
- a **text-to-motion model** such as MDM — needs a GPU backend and sidelines Jev.

## Hackathon state

**Submitted on 26 October 2026**, before submissions closed. The build
checklist in `devpost/checklist.md` has all six slices ticked, and the final
review, the learning wrap-up and the app map are closed out. `6-ship` is done:

- Public repo at `github.com/JackMerma/atmosphere`.
- Demo video, one take, sped up 1.32x to 2:57 against the three-minute limit.
- Entry at `devpost.com/software/atmosphere-anything`, listed under
  "Build With AI: Basics".
- The pitch deck lives outside the repo, as a private Claude artifact.

Nothing in "The road ahead" below was done. Travel, the contact shadow and
secondary motion are all still open, and the weaknesses listed above are the
ones the submitted build shipped with.

One rule is only partly met, and it is cheap to close if this project
continues: the hackathon asks that the public repo carry an open-source licence
file, visible in GitHub's About section. There is no `LICENSE` in the tree.
