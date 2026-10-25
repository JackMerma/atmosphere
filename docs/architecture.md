# Architecture

How the pieces fit together. For what happens during a generation, see
[`pipeline.md`](pipeline.md); for why it is shaped this way, see
[`decisions.md`](decisions.md).

## The stage

Two copies of the uploaded model are always parsed, but only shown side by
side when `dualState` is on (the "Pin initial / final state" checkbox, off by
default).

- **Left — the initial state.** Also the *stage model*: every animation is
  built on it and played back on it. Shown, centred, whatever `dualState` is.
- **Right — the final state.** A reference the user poses; it never animates.
  Only mounted with `dualState` on — its labelled panel, its joint handles and
  the magnet transition all gate on the same flag. Parsing it unconditionally
  means turning the checkbox on needs no re-upload.

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
| `dualState` | off by default; whether the final-state copy, its panel and the magnet transition show at all |
| `animations`, `activeAnimationId`, `playing` | the history and playback |
| `settings` | the knockout sliders (ranked poses, options per query, batches) and the three physics dials (joint limits, chain reaction, collisions) |
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
  alone, framed whole, off-screen, so judging never flickers the page, and
  `captureProxy(segments, yaw, side)`, which poses and photographs the
  mannequin instead (see "The pose libraries" below) -- this is what a
  generation actually calls. `yaw` swings the shot around the model without
  moving the user's camera. `lockFrame`/`clearFrames` hold a capture's framing
  still across a run of several; currently unused now that nothing judges a
  sequence of frames, kept because a future judge over several poses at once
  would need exactly this.
- **`PlaybackDriver`** — drives the stage model through the active animation,
  by way of `lib/timeline.ts`, which is the same code the offscreen captures a
  judge is shown go through.
- **`CentroidLock`** — holds each model over its spot on the stage *sideways
  only*. Height belongs to the floor.
- **`StageChoreography`** — owns the stage groups and the magnet transition.
  Only runs that when `dualState` is on; off, the one model stays centred and
  none of the merge math executes.

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
  collision.ts      capsule self-collision, strength dial
  settle.ts         limits -> collision -> limits; every pose goes through it
  ikChain.ts        spreads a drag up the chain so a body reacts as a whole,
                    strength dial
  grounding.ts      stands the figure on its lowest foot
  anchor.ts         the hips: nothing automatic may rotate them
  timeline.ts       the pose an animation holds at a given time, dials applied
  motionParams.ts   the playback dials (amplitude, drag, bob, arm phase,
                    spacing); fixed at their defaults, nothing searches them
  viewAngles.ts     the camera yaws a candidate pose is judged from
  poseLibrary.ts    the pose vocabulary: distance between poses, and search
  libraryChoice.ts  the knockout: Jev picks one pose out of a shortlist
  mannequin.ts      the stand-in body every candidate is photographed on
```

`scripts/mannequin.ts` strips one of those animation files to a matte, textureless,
animation-free `.glb` (34MB of FBX down to 4.8MB) and `lib/mannequin.ts` keeps it in
a scene of its own. **Jev is never shown the uploaded model.** A costume, a
hairstyle and a texture are noise in a question only ever about where the limbs
are, and a fixed body makes one run's judgements comparable with another's. The
pose that wins still plays back on the user's model, because poses travel as
segment directions and carry no rig with them.

`scripts/harvest.ts` builds that vocabulary out of animation files (a Mixamo
download is a sequence of poses) into `public/poseLibrary.json`. Only
direction numbers survive the harvest -- no mesh, no texture, no bone names
-- which is what lets a pose taken from one skeleton apply to any humanoid.

### Segment vectors

The pivot of the whole design. A pose is described as **the direction each body
segment points, seen from the camera** — `thigh_l: [0, -0.85, 0.55]` means the
character's left thigh points down and toward the viewer.

This representation is shared by everything: the planner writes poses in it,
pose estimation from a photo produces it, mirroring operates on it, and
attention measures distances in it. `measureSegments` reads a pose out of a
skeleton and `applySegmentsToRig` writes one back, and the round trip is exact.

### Poses, and how they are played

A pose says where the body goes. It says nothing about how it gets there, and
that is most of what makes motion read as motion. `MotionParams` holds the
rest, global to one animation: how far each pose commits (`amplitude`, and
`armAmplitude` for the arms alone), how far each joint trails the one above it
(`lag`), how much of the floor contact is applied (`bob`), where the arms sit in
the cycle (`armPhase`), and how the time between poses is spent (`spacing`).

Every one of them used to be a constant, and the honest reason is that nobody
knew what to set them to. They are now what Jev is asked about.

### `settlePose` is the one way in

Every path that writes a pose — the planner's vectors, a Jev candidate, a photo
estimate, a drag, each frame of playback — ends in `settlePose`, which applies
the joint limits, resolves self-collision, and repeats until the body is clear.
There is no way to set a pose that skips the physics.

## The control panel and the debug/playback overlays

`app/page.tsx` renders one fixed, top-right panel (`ModelUpload`,
`PhysicsSection`, `MotionSection`, `AnimationsHistoryPanel`, `PlayButton`) with
**no scroll mechanism at all** — no `max-height`, no `overflow`. That is a
deliberate choice, not an oversight: Physics and Motion are an **exclusive
accordion** (`openPanel` in the store, below — opening one closes the other),
and the animation list scrolls within its own fixed height, so the panel as a
whole has no real reason to outgrow the viewport.

- **`openPanel`** (`store/useAtmosphereStore.ts`) replaced each of
  `PhysicsSection`/`MotionSection`'s own local `useState` — one shared field so
  opening one collapses the other, instead of both staying open at once.
- **AI-named titles.** The planner's schema carries a `title` (one or two
  words), hard-cut to two words regardless of what comes back, used as a saved
  animation's label (`lib/animations.ts`); empty falls back to "Animation N".
- **`DebugFilmstrip.tsx`** + **`store/useDebugFilm.ts`** — a live strip along
  the bottom of the screen of every photograph taken of every judged
  candidate, grouped by which planner pose a run of images belongs to and then
  by candidate. Collapsed by default, only mounted when there is something to
  show, filled in live (pushed the instant a photo is captured, not once the
  round's Jev call returns). Purely observational debug tooling — nothing in
  the pipeline reads it back. See `pipeline.md` for where it hooks in.

### The follow-camera mini-view

`FollowCameraView.tsx` draws a small picture-in-picture view, top-right (left
of the control panel), of a second camera that tracks the stage model's live
world position every frame — so a jump that carries the figure off-frame in
the user's own (free-orbit) camera still reads as centred and front-on here.
Shown only while `playing`.

The technique matters because of a hard constraint: a `THREE.Object3D` has
exactly one parent, so a second `<Canvas>` mounting the model's `<primitive>`
a second time would **move** it out of the main view, not duplicate it. The
actual approach is the standard three.js one for more than one viewport in a
single canvas — a second `gl.render()` call into a scissored region of the
*same* framebuffer, with the *same* renderer and the *same* scene, right after
the main render:

```
gl.setScissorTest(false); gl.setViewport(0, 0, size.width, size.height);
gl.render(scene, camera);              // the main view, drawn explicitly
...
gl.setScissorTest(true);
gl.setScissor(x, y, px, px); gl.setViewport(x, y, px, px);
gl.render(scene, followCamera);        // the mini-view, on top
```

`useFrame(callback, 1)` — any numeric priority — switches off R3F's own
automatic render for the *whole* canvas (it always covers the full canvas and
would otherwise clear this), so the main view has to be rendered explicitly
here too, first, full-size, every frame.

**`gl.setViewport`/`gl.setScissor` take CSS-pixel values already** — three.js
multiplies by the renderer's own `_pixelRatio` internally. Pre-multiplying by
`gl.getPixelRatio()` before calling them double-applies the ratio. That is
invisible at ratio 1 (1² = 1) and only breaks on a display or monitor whose
scale factor isn't 1 — exactly the bug reported and fixed on 25 October (see
`decisions.md`).

`lib/followViewLayout.ts` holds the one rect (`followViewRect()`) both halves
share: this WebGL render, scissored into it, and `FollowCameraFrame.tsx`, a
plain non-interactive HTML border drawn over the same pixels so the result
reads as a framed picture-in-picture rather than an unbordered patch of the
scene. Both gate on `playing` alone.

## The API routes

Server-side only, so the keys never reach the browser.

| Route | Calls | For |
|---|---|---|
| `POST /api/motion/plan` | OpenAI | author every pose of an action, with timing |
| `POST /api/motion/rank` | Jev | pick the best of several candidate poses |
