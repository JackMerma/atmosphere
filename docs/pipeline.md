# The motion pipeline

What happens between pressing **Generate** and an animation appearing in the
history. The code is `lib/animator.ts`, `lib/plannerClient.ts` and
`lib/refine.ts`.

## Without a prompt

A direct, eased blend from the initial state to the final state over 2 seconds.
**No API calls at all** — it is instant, and it is pure interpolation.

It refuses if the two states are the same pose, since there would be nothing to
animate.

## With a prompt

### 1. The planner authors every pose

One call to OpenAI. It is given the model's rest pose as segment vectors, any
state the user pinned by hand, and the prompt. It returns:

| | |
|---|---|
| `duration` | total seconds, 0.8–12 |
| `loop` | a repeating cycle, whose last pose flows back into the first |
| `mirrorHalf` | the second half of the cycle is the left/right mirror of the first |
| `keyframes` | 2–8 poses covering the **whole** action |

Each pose carries its time `t`, its easing, a hold, whether the figure's weight
is on the floor, a written description, and a direction vector for all 13 body
segments.

The system prompt teaches it what actions are made of — a walk is contact and
passing poses with the arms opposite the legs; a jump is crouch, push, peak,
land, settle — and carries a **worked walk cycle with real vectors**, because
the abstract description alone produced legs that both pointed backward.

A state the user pinned by hand overrides the planner's first or last pose.

### 2. Mirrored halves are derived, not authored

When `mirrorHalf` is set, only the first half of the cycle is built and
judged. The rest is its exact left/right reflection. That keeps a walk
symmetric instead of letting each pose drift as it is polished on its own, and
halves the work.

### 3. Each authored pose is built, then polished

For each pose in the first half:

1. **Build it** from the planner's vectors, carrying over the pose before it so
   joints the planner did not mention stay where the motion left them.
2. **Refine it** (`refinePose`), repeated for as many rounds as the slider says:
   - Work out **where to look**. When the planner authored the pose it also gave
     the exact direction every segment should point, so the parts furthest off
     are simply measured. Only a pose taken from a photo has no such target, and
     there Jev is asked to name the part that looks most wrong.
   - Build `candidates` variants, concentrated on those parts. The first ones
     come from a pool of **structured edits** — mirroring a limb chain's depth,
     leaning it toward or away from the viewer, turning the body — which are the
     errors pose estimation actually makes. Once those are spent it falls back
     to random multi-limb nudges that shrink as they stop paying off.
   - Render every candidate **from two angles** (head-on and three-quarter) and
     ask Jev, in one call, which is best. **The pose we already have is among
     the options**, so a round can hold but never make things worse.

Every candidate goes through `settlePose`, so none of them can be an impossible
body.

### 4. Then the whole motion is judged

The poses are now as close to what was asked for as judging them one at a time
can get them. What is left is how they are *played*, which no pose says
anything about.

So `tuneMotion` shows Jev the whole thing. Each round:

1. Builds a few variants of the same animation, **one dial moved at a time** —
   a judge can say which of two motions is better but not why, and a verdict on
   two dials moved together says nothing about either.
2. Renders every variant as a **sheet of six frames in time order**, numbered,
   from a camera **held still** across all of them. A still camera is the whole
   trick: left to re-centre on the figure, a capture subtracts exactly the rise
   and fall that carries the weight.
3. Asks Jev which sheet reads best as the action — with the motion we already
   have among the options, so a round can hold but never make things worse.

The poses never change here. Only how they are played.

Jev refuses a sheet laid out in one row (`Invalid image dimensions` at 6:1), so
the six frames wrap into three across and two down.

### 5. Playback

`PlaybackDriver` walks the timeline each frame:

- Keyframes are slerped with each one's easing and hold, and the dials the
  animation was tuned to are applied: `lib/timeline.ts` is the same code the
  sheets a judge was shown went through, so what plays is what was judged.
- **Each joint reads the timeline slightly behind the one above it**, so the
  shoulder turns, the elbow follows and the hand arrives last.
- `settlePose` runs once per frame.
- When the pose is grounded, the figure is **stood on its lowest foot**, which
  is where the weight comes from: the legs bend, the body drops, and the hips
  rise again as they extend.
- The foot carrying the weight **does not move across the ground**. Whatever
  movement the pose gives it is slid into the floor instead, which is both why a
  walk no longer skates and why the figure travels. Measured once per animation
  into a curve, because travel is a sum of ordered steps while the timeline is
  sampled out of order.
- A cycle runs its last pose straight back into its first; a one-off rests on
  the final pose and eases back.

Starting playback merges the two models into one figure; stopping springs them
apart and restores the poses they held.

## What a run costs

For a 4-pose walk cycle at the default settings (10 rounds, 4 candidates),
`mirrorHalf` halving the work to 2 judged poses:

| | Calls |
|---|---|
| OpenAI | 1 |
| Jev pose ranking | 2 poses × 10 rounds = 20 |
| Jev scoring (reporting only) | 4 |
| Jev motion ranking | 4 rounds = 4 |

Each pose-ranking call carries 10 images (5 candidates × 2 views) at about 2k
input tokens. A motion round carries 8 sheets (4 variants × 2 angles) at about
**12.5k input tokens**, which is why it defaults to 4 rounds rather than 10.

**Pose rounds** and **Motion rounds** can each be set to 0 independently, which
is how to see what either half is worth on its own.
