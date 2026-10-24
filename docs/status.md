# Status

Where the project stands, honestly. Written to pick the work back up later.

Last worked on: 24 October 2026. Head of `master`: `ceaef81`.

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

## What is weak, and known

Ordered by how much it costs the result.

1. **Feet slide horizontally.** They rise and fall correctly, but nothing pins
   them front-to-back during a stance phase, so a walk still skates. **This is
   the next piece of the physical layer and the biggest remaining gap in a
   walk.**
2. **The vertical bob may be too strong.** The rule is right, but the planner
   bends the knee a lot in a passing pose, so the body can dip further than it
   should. Not yet tuned against a human eye.
3. **Arms barely swing in a walk.** The planner leaves them near vertical
   (z 0.00–0.30) where the legs reach 0.55. This is the same class of failure
   the legs had, and it was fixed there by putting concrete vectors in the
   system prompt. The same fix has not been applied to the arms.
4. **Jev has not been shown to improve a pose.** The ranking design is sound and
   monotone, but no with/without comparison has been run. `Rounds = 0` skips Jev
   entirely and exists precisely to make that comparison possible.
5. **A large FBX freezes the page** for seconds while it parses. Cloning the
   second copy halved it; a worker would fix it properly.
6. **Depth from photos is unreliable.** MediaPipe's z is noisy, which is what
   the structured "mirror the limb's depth" candidates exist to repair.

## Not covered

- A rig that is not humanoid: limits, collision, grounding and the planner all
  no-op or refuse. Dragging still works.
- Playback of animations saved by the pre-timeline pipeline is supported but
  untested since the rewrite.
- The Sketchfab `.zip` path has only been exercised under Node, not through the
  browser upload (the file is larger than the test harness can upload).

## The road ahead

The judgement reached with the user on 24 October: **this architecture — an LLM
writing static poses, interpolated, with Jev polishing — has a ceiling, and we
are near it.** Mixamo's animations look good because they are motion capture of
real people: every frame carries correct timing, weight and balance, at 30–60
fps. Four keyframes slerped together cannot reach that by polishing the poses.

The user chose to close the gap with the **physical layer** first, since it
improves the result under any later direction. Done so far: ground contact and
per-joint lag. Still to do:

1. **Foot planting** — pin the support foot front-to-back during its stance.
2. **Tune the bob** against a real eye.
3. **Arm swing vectors** in the planner prompt.

If that still does not impress, the two routes discussed were a **mocap clip
library** the planner composes from (looks like Mixamo because it is Mixamo, but
changes what the project is), and a **text-to-motion model** such as MDM (needs
a GPU backend and sidelines Jev).

## Hackathon state

The build checklist in `devpost/checklist.md` has all six slices ticked. The
final review, the learning wrap-up and the app map are **not** done, and `6-ship`
— demo video, public repo, Devpost submission — has not been started.
