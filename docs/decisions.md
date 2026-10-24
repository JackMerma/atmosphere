# Decisions

Why the project works the way it does, including what was tried and dropped.
Most of these were forced by something that did not work.

## Jev ranks candidates; it does not score them

**It started as:** hill-climbing on Jev's 0–1 match score.

**Why that failed:** the scores sit low and barely move — 0.1 to 0.5 for poses
that look right. Climbing a hill on a signal that flat, with random candidates,
is close to random search.

**Now:** one Choice call per round, "which of these is best", with the current
pose among the options. Ranking is a far easier question than scoring, it is
one call instead of one per candidate, and including the current pose makes a
round monotone by construction — it can hold, but never make things worse.

The absolute score survives in `/api/motion/judge`, used twice per pose purely
to report progress.

## Candidates are shown from two angles

A walk lives on the front-to-back axis. Head-on, that axis is *depth*: a leg
forward and a leg back look nearly identical. We were asking Jev to judge a
picture in which the thing that mattered was invisible.

Every candidate is now rendered head-on **and** at 55°, the angle animators
check poses from for exactly this reason.

## The planner authors every pose, not just the middle

**It started as:** the user pinned a start and an end, and the LLM filled in
between.

**Why that failed:** ask for "walking" and there is no start pose the user
wants to pin. The action *is* the sequence.

**Now:** the planner returns the complete set of poses, with a `loop` flag for
cycles. Pinned states still override its first or last pose.

## Cyclic halves are mirrored, not re-authored

Refining pose 3 of a walk independently of pose 1 lets them drift, and the
cycle comes out asymmetric. The planner says whether a cycle's halves mirror
(true for walking and running, false for waving one hand — it gets this right),
and the second half is derived by reflection.

Mirroring happens in **segment space**, not on quaternions: swap left and right,
negate x. That is exact and testable, where mirroring bone rotations across a
skeleton whose left and right rest orientations differ is neither.

## Attention is measured where it can be, and asked where it cannot

Moving random limbs wastes most candidates: for "raise the right arm", the legs
were already right.

The user suggested a grid over the image with Jev scoring each cell. That was
turned down for a concrete reason: **a cell of a 2D render does not correspond
to a joint.** Limbs overlap, and the mapping changes with the camera. Knowing
which cell is the arm means projecting the bones to screen space — at which
point the answer is already known without asking.

Instead:

- **Planner poses** carry the exact target directions, so the gap is *measured*.
  Free, and sharper than reading it off a picture.
- **Photo poses** have no such target, and there Jev picks the worst part by
  name, which is a well-posed ranking.

A fifth of random nudges ignore attention, so a part it overlooked is never
locked out.

## A pose must be a body that could exist

Three layers, applied by `settlePose` on every write:

1. **Anatomical ranges**, measured per model from its own proportions at rest,
   so an A-pose and a T-pose both work. Rotation is split into swing (where the
   limb points) and twist (rotation about its own axis), and each is clamped.
   Elbows and knees are hinges: sideways intent is projected away rather than
   turned into a fold, and hyperextension is blocked.
2. **Capsule self-collision**, so limbs do not pass through the torso or each
   other. When a push runs along a bone — a forearm driven into the chest — no
   rotation of the elbow can help, so the push walks up the chain to the
   shoulder, which is also how a real arm reacts.
3. **An anchor.** Nothing automatic may rotate the hips; doing so swings the
   whole figure. The anchor is found through the humanoid rig, not by assuming
   the hips are the root bone — in one test model they are not.

**The joint-limit dial scales layer 1 only.** Collisions are never scaled: a rag
doll still does not pass through itself. At 0 the limits lift entirely;
hyperextension relaxes more slowly than everything else, because that is the one
that reads as a broken body.

## Weight comes from the floor, not from a curve

A walk looked floaty because the hips never rose or fell. Rather than animate
the hips, a grounded figure is **stood on its lowest foot** each frame. The legs
bend, the foot would sink, and holding it on the floor pushes the body down
instead. The bob, the dip into a crouch and the lift out of it all fall out of
one rule.

`CentroidLock` gave up control of height to make room, and now only stops a
swinging limb from walking the body sideways.

## Planner: OpenAI, after Gemini

Gemini ran out of quota mid-session and its free tier returned 429s and 503s.
Switched to `gpt-4.1-mini`, which is cheap (~$0.005 a generation), fast because
it does not reason, and supports strict structured outputs — which the pipeline
depends on, since it is reading 13 vectors per pose.

## Models are normalised on load

Exporters disagree on units: Mixamo's FBX is in centimetres where its GLB is in
metres. Every model is scaled to a standard height and stood on the floor, so
one camera framing suits them all.

FBXLoader rebuilds the whole bone hierarchy once per skinned mesh and nests the
copies, so a 95-bone rig arrived as **665 bones stacked seven deep**. The copies
are collapsed and every mesh bound to the outermost skeleton.

## Rejected

- **A grid-of-cells attention map** — see above.
- **Depth estimation for the photo states** — it would help, but it only
  improves two poses, and the weakness is the motion between them.
- **Gravity, balance, a real solver** — out of scope; the model floats on
  purpose.
- **A motion-capture clip library (the Mixamo approach)** — would look the best
  fastest, because it *is* mocap, but it changes the project from generating
  motion to composing it. Deliberately left as the user's call; see
  [`status.md`](status.md).
