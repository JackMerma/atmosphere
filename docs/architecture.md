# Architecture

How the pieces fit together. For what happens during a generation, see
[`pipeline.md`](pipeline.md); for why it is shaped this way, see
[`decisions.md`](decisions.md).

## The stage

Two copies of the uploaded model stand side by side.

- **Left — the initial state.** Also the *stage model*: every animation is
  built on it and played back on it.
- **Right — the final state.** A reference the user poses; it never animates.

The file is parsed once and the second copy is cloned from it
(`SkeletonUtils.clone`), which halves the page freeze a large FBX causes. The
clone gets its own materials, because cloning shares them and the stage fades
the right-hand copy out when the two merge.

Each model lives inside a **stage group** that carries its position on the
stage. Nothing else touches those groups, so sliding the models around never
fights the code that holds each body in place inside its own group.

## Where state lives

`store/useAtmosphereStore.ts` (Zustand) holds everything the UI reacts to:

| | |
|---|---|
| `scene` / `finalScene` | the two models |
| `slots.initial` / `slots.final` | each side's saved pose, its name, and the photo it came from |
| `animations`, `activeAnimationId`, `playing` | the history and playback |
| `settings` | refinement limits and the joint-limit dial |
| `viewport` | an imperative handle onto the canvas: the camera, and `capture()` |
| `generating`, `merged`, `capturing` | flags the 3D layer reads each frame |

Two things deliberately sit **outside** React:

- **The joint-limit strength** is module state in `lib/jointLimits.ts`. It is
  read inside the render loop and on every bone write, which must not reach
  into React.
- **Bone rotations** are never stored in React. They are mutated directly on
  the three.js objects and snapshotted into arrays only when a pose is saved.

Models and animations persist in IndexedDB (`lib/db.ts`). Poses do not: a
reload puts the model back at rest.

## The 3D layer

`components/RigViewport.tsx` mounts the canvas and, inside it, four components
that render nothing and only act each frame:

- **`ViewportBridge`** — registers `capture(side, yaw)`, which renders one model
  alone, framed whole, off-screen, so judging never flickers the page. `yaw`
  swings the shot around the model without moving the user's camera.
- **`PlaybackDriver`** — drives the stage model through the active animation.
- **`CentroidLock`** — holds each model over its spot on the stage *sideways
  only*. Height belongs to the floor.
- **`StageChoreography`** — owns the stage groups and the magnet transition.

`JointHandles` draws the draggable orange dots. They sit outside the stage
groups because they track their bones in world space.

## The pose libraries

```
lib/
  modelLoader.ts    reads .glb/.gltf/.fbx/.zip, normalises scale, collapses
                    the duplicate skeletons FBXLoader produces
  gltfJoints.ts     parses a file into the two stage models
  humanoidRig.ts    recognises a humanoid from bone names (Mixamo, _L/.R, ArmL)
  poseRetarget.ts   segment vectors <-> bone rotations, and mirroring
  pose.ts           snapshot / restore / rest, and the per-side slots
  jointLimits.ts    anatomical ranges, measured per model, scaled by the dial
  collision.ts      capsule self-collision
  settle.ts         limits -> collision -> limits; every pose goes through it
  ikChain.ts        spreads a drag up the chain so a body reacts as a whole
  grounding.ts      stands the figure on its lowest foot
  anchor.ts         the hips: nothing automatic may rotate them
```

### Segment vectors

The pivot of the whole design. A pose is described as **the direction each body
segment points, seen from the camera** — `thigh_l: [0, -0.85, 0.55]` means the
character's left thigh points down and toward the viewer.

This representation is shared by everything: the planner writes poses in it,
pose estimation from a photo produces it, mirroring operates on it, and
attention measures distances in it. `measureSegments` reads a pose out of a
skeleton and `applySegmentsToRig` writes one back, and the round trip is exact.

### `settlePose` is the one way in

Every path that writes a pose — the planner's vectors, a Jev candidate, a photo
estimate, a drag, each frame of playback — ends in `settlePose`, which applies
the joint limits, resolves self-collision, and repeats until the body is clear.
There is no way to set a pose that skips the physics.

## The API routes

Server-side only, so the keys never reach the browser.

| Route | Calls | For |
|---|---|---|
| `POST /api/motion/plan` | OpenAI | author every pose of an action, with timing |
| `POST /api/motion/rank` | Jev | pick the best of several candidate poses |
| `POST /api/motion/judge` | Jev | score one pose, 0–1, for reporting |
| `POST /api/motion/attention` | Jev | name the body part that looks most wrong |
