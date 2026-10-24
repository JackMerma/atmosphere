# Numeric checks

The maths in this project is the kind that looks right on screen while being
wrong — a limb a few degrees off, a mirror that flips the wrong axis, a clone
that quietly shares state. These scripts assert the behaviour in numbers
instead.

They are plain TypeScript run with `tsx`, not a test framework: no runner, no
config, no dependency added to the project.

## Running them

```bash
npx tsx checks/limits.ts        # joint ranges and the strength dial
npx tsx checks/physics.ts       # self-collision and chain coupling
npx tsx checks/mirror.ts        # mirroring a pose left/right
npx tsx checks/attention.ts     # which limbs the search focuses on
npx tsx checks/grounding.ts     # standing on the floor, and weight   (needs a model)
npx tsx checks/formats.ts       # loading .glb / .fbx / .zip          (needs a model)
```

Each prints a `PASS`/`FAIL` line per assertion and exits non-zero on failure.

The first four build a synthetic Mixamo-named skeleton in code and need
nothing else. The last two need a real model: drop any rigged `.glb`, `.gltf`,
`.fbx` or Sketchfab `.zip` into `checks/fixtures/` and they pick it up by
extension. Without one they skip with a message rather than fail.
`checks/fixtures/` is not committed — the models are large and not ours to
redistribute.

## What each one is really protecting

- **`limits.ts`** — that the dial is monotone (a knee twist of 120° clamps to
  35° / 108° / 120° at strength 1 / 0.5 / 0), that a hinge cannot hyperextend
  or bend sideways, and that a legal pose is left bit-for-bit untouched.
- **`physics.ts`** — that overlapping limbs are detected *and* separated, that
  collisions still act with the limits off, and that a drag decays up the chain
  without reaching the hips.
- **`mirror.ts`** — that a walk contact mirrors into the opposite contact, the
  arms stay opposite their own leg, mirroring twice is the identity, and the
  figure keeps facing the viewer.
- **`attention.ts`** — that a one-armed action focuses on that arm alone, that
  the worst part leads, and that tiny differences are ignored as noise.
- **`grounding.ts`** — that the feet stay on the floor while the hips drop into
  a crouch, and that a deeper crouch drops further. This is the weight.
- **`formats.ts`** — that each format loads, normalises to the same height, is
  recognised as a humanoid, and that the two stage copies share no bone and no
  material.

## Two measurement traps this project hit

Both of these produced a convincing-looking failure that was not real. Worth
knowing before writing another check.

**`Quaternion.angleTo` is unstable near zero.** It is `2·acos(|dot|)`, and acos
is ill-conditioned when the dot product is near 1, so two identical rotations
can report a difference of `5.8e-4`. Compare components directly when asserting
that nothing moved.

**`Box3.setFromObject` ignores skinning.** It reads a skinned mesh's bind pose,
so it never sees the pose the bones are actually in. Two different models
reporting the exact same number is the tell. Measure bone world positions
instead.
