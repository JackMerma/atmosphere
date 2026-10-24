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

## Jev judges the motion, not only the pose

**It started as:** Jev ranking candidate poses, one pose at a time.

**Why that was the wrong axis:** the poses were never what was wrong. A walk
reads badly because of weight, drag and timing, and a single pose says nothing
about any of them. The judge was being spent on the one thing that was already
right, and no amount of polishing four poses turns them into motion.

**Now:** the whole animation is rendered as a sheet of frames in time order and
ranked as motion. The variants differ only in *how the same poses are played*,
so the question is about movement and nothing else. The ranking design is
unchanged — one Choice per round, the incumbent among the options, monotone by
construction — just lifted a level.

The dials it searches were all constants before, and the honest reason they were
constants is that nobody knew what to set them to. Asked about "walking" over
six rounds it widened the arm swing, deepened the drag and pulled the timing
early, and left amplitude and the bob alone. The arm swing is the weakness the
planner's system prompt had failed to fix, so this reached something the
authored-pose path could not.

What it does **not** do is add frames. Four keyframes are still four keyframes,
and the ceiling in [`status.md`](status.md) is unchanged.

## A sheet of frames, not a row, and the camera must not move

Two things had to be right for a judge that only sees stills to see motion.

**The frame is held still.** A capture normally re-centres on the figure, which
is right when the question is what pose it is in, and wrong when the question is
how it moves: re-centring every frame subtracts exactly the rise and fall that
carries the weight. `lockFrame` widens one frame to hold every pose it will be
shown and then every shot is taken from the same place. Distance is worked out
from the corners of that box rather than from the vertices, which frames a
little wide — the right trade when the vertices of every pose are not all in
hand at once, since framing wide costs pixels where framing tight clips a limb.

**The frames wrap.** Six frames in a row, which is how an animator pins
thumbnails up, is an image six times wider than it is tall, and Jev refuses it
outright: `Invalid image dimensions`. Three across and two down is the same
sheet, accepted, with the numbers carrying the reading order.

## Candidates are shown from six angles, not two

A walk lives on the front-to-back axis. Head-on, that axis is *depth*: a leg
forward and a leg back look nearly identical. We were asking Jev to judge a
picture in which the thing that mattered was invisible.

The first fix was two views — head-on and 55°, the angle animators check poses
from — which solved that one axis. It never solved the general case: a limb
hidden behind the torso from both of those is invisible to the judge however
wrong it is, and nothing ever showed the body from the side or the back.

**Now** (`lib/viewAngles.ts`) pose candidates and photo attention are shown
from six views, spaced 60° apart around the full turn — `[0, 60, 120, 180, 240,
300]` — which puts every part of the body in profile from at least one of
them. Verified against the real API: a pose-ranking call at the default
candidate count runs 0.6–1.3s and 730–950KB, no errors.

**Motion sheets stay at three.** A motion sheet already bundles six time-samples
into one image; giving it six camera angles too multiplies to a request Jev's
own endpoint refuses outright — hit for real at four candidates × six angles ×
six frames = 24 images, 1.7MB, `max_tokens_exceeded`. `MOTION_VIEWS` takes every
other one of the same six (`[0, 120, 240]`), confirmed to go through at the
default settings (800–950KB, 0.6–1.3s per call). Still three times the single
blind axis motion ranking had before.

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
`nudge()`; at 0, `resolveCollisions` returns immediately and reports no hits,
so the search loops in `refine.ts` that check "did this clear any overlaps"
still behave sanely. Independent of the joint-limit dial on purpose: a body can
bend past a normal human range and still not pass through itself, or the
reverse.

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
