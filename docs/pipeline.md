# The motion pipeline

What happens between pressing **Generate** and an animation appearing in the
history. The code is `lib/animator.ts`, `lib/plannerClient.ts` and
`lib/libraryChoice.ts`.

A prompt is required. There is no blend-two-pinned-states fallback: every pose
comes from a description now, so Generate stays disabled until there is one.
`dualState` (the "Pin initial / final state" checkbox, off by default) decides
whether there is anything to pin at all — see `architecture.md`.

## 1. The planner authors every pose

One call to OpenAI. It is given the model's rest pose as segment vectors, any
state the user pinned by hand (only possible with `dualState` on), and the
prompt. It returns:

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

The moment this call returns, the whole sequence is shown in the Motion panel
as plain text — what the plan is made of, before a single pose has been chosen.
Mirrored entries show the first half's own text plus "(mirrored)", matching
what step 3 actually builds for them rather than whatever the planner wrote for
that half and step 3 then discards.

## 2. Mirrored halves are derived, not chosen

When `mirrorHalf` is set, only the first half of the cycle goes through
choosing. The rest is its exact left/right reflection of the pose the first
half actually settled on — not of the planner's request for that half, which
may differ from what got chosen. That keeps a walk symmetric instead of
letting each half drift on its own, and halves the work.

## 3. Each pose is chosen, not constructed

For every pose of the first half (`chooseLibraryPose`):

1. **Measure.** Every pose in the harvested vocabulary is scored against the
   planner's target for this one — a weighted mean angle over the segments both
   define, arms and legs weighted above spine and head, since a pose scores
   well on a flat average by getting the torso right while both legs point the
   wrong way. Free, instant, no call. The library is stored in world
   directions and the target is in the camera's frame, so one is converted into
   the other before they are ever compared.
2. **Shortlist** the `rankedPoses` nearest, keeping each at least 15° from
   every other one already kept. An animation samples continuous motion, so
   without this the nearest poses are usually consecutive frames of a single
   clip — asking Jev to pick among five near-identical pictures wastes the one
   question being asked.
3. **Ask.** The shortlist is photographed on the **stand-in mannequin**
   (`lib/mannequin.ts`), never on the uploaded model — a costume, a hairstyle
   and a texture are noise in a question only ever about where the limbs are,
   and a fixed body makes one run's judgements comparable with another's. Each
   candidate is shot from four angles (`lib/viewAngles.ts`:
   front/right/back/left), once, and those images are reused in every round it
   survives.

Asking is a knockout, not one big vote: Jev compares `optionsPerQuery` poses at
a time, the winner of each heat goes through to the next round, and `batches`
of a round's questions run concurrently. `optionsPerQuery` of 1 skips Jev
entirely and the measured nearest wins outright — the way to see what asking is
worth over just measuring. The knockout always lands on exactly one pose; see
`checks/knockout.ts` for the shape this is pinned to, including the worst-case
question count for any setting of the three sliders.

Every pose that comes out of this, chosen or mirrored, goes through
`settlePose`, so none of them can be an impossible body.

## 4. Playback

`PlaybackDriver` walks the timeline (`lib/timeline.ts`) each frame, with the
dials in `lib/motionParams.ts` left at their defaults — nothing searches them
any more, so a generated animation plays exactly as authored:

- Keyframes are slerped with each one's easing and hold.
- **Each joint reads the timeline slightly behind the one above it**, so the
  shoulder turns, the elbow follows and the hand arrives last.
- `settlePose` runs once per frame.
- When the pose is grounded, the figure is **stood on its lowest foot**, which
  is where the weight comes from: the legs bend, the body drops, and the hips
  rise again as they extend.
- A cycle runs its last pose straight back into its first; a one-off rests on
  the final pose and eases back.

With `dualState` on, starting playback merges the two stage models into one
figure; stopping springs them apart and restores the poses they held. With it
off there is only ever the one model, and none of that runs.

## What a run costs

For a 5-pose plan at the default settings (16 ranked, 4 per query, 3 batches),
no pose mirrored:

| | Calls |
|---|---|
| OpenAI | 1 |
| Jev (knockout questions) | up to 17 per pose at these defaults |

Measured against the real API, same prompt, same model: **25 rank calls, 0
errors, 63s total**, each call 185–205KB and 425–1498ms. Each call carries
`optionsPerQuery` candidates × 4 views = up to 16 images.

The question count is not linear in `rankedPoses`: a knockout of `n` candidates
at `optionsPerQuery` per heat takes at least `ceil((n-1)/(optionsPerQuery-1))`
questions (fixed-size heats don't pack perfectly, so the real count sits a
little above that floor — `checks/knockout.ts` bounds the overhead at 3). At
the slider extremes (50 ranked, 2 per query) that floor is 49 questions for a
**single** pose. `rankedPoses` and `optionsPerQuery` both move this; `batches`
does not change the count, only how much of it runs at once.

**`optionsPerQuery` can be set to 1**, which is how to see what asking Jev is
worth over just measuring: 0 questions, the nearest candidate wins outright.
