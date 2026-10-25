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

## Jev chooses a pose instead of searching for one

**It started as:** the planner wrote 13 direction vectors per beat and Jev
hill-climbed toward them over ten rounds of candidate poses.

**Why that was weak:** every pose began as an LLM's approximation of a body, and
the search that was meant to fix it climbs a signal Jev reads badly. `status.md`
has admitted throughout that the search was never shown to improve a pose.

**Now:** a vocabulary of poses harvested from animation files (`scripts/harvest.ts`)
and Jev picks one per beat. Every candidate is a pose a real person actually
held, so the floor is a real body rather than an approximation of one, and
choosing is a Choice -- the question Jev is good at -- at one call per beat
instead of ten.

The narrowing is **measured** and the pick is **asked**, the same split already
settled on for attention. The planner states the exact direction every segment
should point, so cutting hundreds of poses to a handful costs nothing and asks
nobody. Only the last step is worth a question.

**And the asking earns its place.** Run against "a standing jump", Jev twice
passed over the numerically nearest pose to take a further one from the right
animation: for the crouch it chose Standing Jump at 41.2deg over a 37deg
alternative, and at the peak it took Standing Jump at 34deg over 32deg and
33deg. The metric ranks; the judge decides, and it decided better than the
number did.

The mirrored half reflects the pose the first half **settled on**, not the one
the planner asked for -- with a library those are different poses, and mirroring
the request would break the symmetry mirroring exists for.

## A shortlist has to offer real alternatives

An animation samples a continuous motion, so the poses nearest a target are
usually consecutive frames of one clip: measured at 0.40s, 0.48s and 0.56s of
the same file. Showing a judge five pictures of one pose wastes the single
question we get to ask it.

`nearestPoses` now keeps the nearest pose and then requires every later one to
be 15deg from everything already shortlisted. The same query went from five
near-identical frames to five poses from three different animations, and the
jump beats started reliably finding the jump animation.

## Candidates are shown from four angles, not one

A walk lives on the front-to-back axis. Head-on, that axis is *depth*: a leg
forward and a leg back look nearly identical, and a crouch can read as
standing. The pipeline went through three widths here, each settled by running
it, not by guessing:

- **Six**, spaced 60° apart, from an earlier design where Jev judged whole
  motions as sheets of frames rather than choosing single poses from a
  vocabulary (that layer no longer exists; see the pipeline refactor in the
  commit history). Caught everything, but a sheet already bundling several
  time-samples into one image times six angles multiplied straight into a
  request Jev's own endpoint refused outright — `max_tokens_exceeded` at four
  candidates × six angles × six frames, 1.7MB.
- **One**, head-on, when the pipeline was rebuilt around choosing from a
  vocabulary instead of searching: a reasonable floor to start measuring cost
  from. Run end to end on "a standing jump", every action pose chose the same
  generic clip — a crouch and a standing pose look alike from the front, so
  the measurement said Standing Jump was close but the judge couldn't tell.
- **Four**, a quarter-turn apart — `[0, 90, 180, 270]`, front/right/back/left —
  is where it sits now. Confirmed by the same prompt: two of three action
  poses switched to the correct animation (crouch and landing both picked
  Standing Jump, at 35.9° and 35.6°) that one angle had missed entirely.

Opposite pairs are the point: between 0/180 and 90/270 every limb is seen
edge-on from one angle and in profile from another, so nothing is invisible
from all four the way it was from one. Verified against the real API at the
default settings: 25 rank calls, 0 errors, 185–205KB each, 63s total for a
5-pose plan (up from 31s at one angle — the direct cost of 4× the images).

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

**The joint-limit dial scales layer 1 only.** At 0 the limits lift entirely;
hyperextension relaxes more slowly than everything else, because that is the one
that reads as a broken body. Collisions have their own dial now (below); by
default it sits at 1, where a rag doll still does not pass through itself.

## Chain reaction and collision strength are also dials, by request

Both started as hard constants: a drag's pull always reached four joints up the
chain at a fixed decay, and `resolveCollisions` always corrected a detected
overlap in full. This reverses the line above for collisions specifically —
previously written here as "collisions are never scaled" — because the user
asked for the control, not because the original reasoning (a rag doll should
not pass through itself) stopped being true at the default.

**Chain reaction** (`lib/ikChain.ts`) scales the per-joint share with
`(FALLOFF * strength)^i`, `i` counted from the joint attached to the dragged
handle. `i = 0` always gets `share = 1` regardless of strength (`x^0 = 1` for
any `x ≥ 0`), which is what lets the handle follow the cursor at all even at
0% — that joint is the one mechanically attached to what is being dragged, not
"another limb" reacting to it. Everything above it scales to exactly 0 at
strength 0. It only affects dragging a joint by hand; the generation pipeline
never moves a joint this way, so it has no effect on a generated pose.

**Collision strength** (`lib/collision.ts`) scales the correction handed to
`nudge()`; at 0, `resolveCollisions` returns immediately and reports no hits, so
`settlePose`'s own "did this pass clear any overlaps" loop still behaves
sanely. Independent of the joint-limit dial on purpose: a body can bend past a
normal human range and still not pass through itself, or the reverse.

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
- **Per-keyframe timing dials** — the dials are global to an animation on
  purpose. Per keyframe there would be too many to search with a handful of
  rounds, and they would let a cycle's halves drift out of symmetry, which is
  the same failure mirroring exists to prevent.
- **A motion-capture clip library (the Mixamo approach)** — would look the best
  fastest, because it *is* mocap, but it changes the project from generating
  motion to composing it. Deliberately left as the user's call; see
  [`status.md`](status.md).
