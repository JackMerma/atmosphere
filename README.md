# Atmosphere

Animate anything. Upload a rigged 3D character, describe an action in plain
language, and the app works out the poses the action is made of, polishes each
one, and plays the result back.

Built for the Devpost **Build With AI: Basics** hackathon.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

You need two API keys in a `.env.local` file at the project root. Copy
`.env.example` and fill it in:

```
OPENAI_API_KEY=sk-...        # plans the motion: timing, beats, poses
OPENAI_MODEL=gpt-4.1-mini    # optional; any model with structured outputs
TYPESAFE_API_KEY=...         # Jev, which judges and polishes each pose
```

`.env.local` is gitignored. Next.js reads it at startup, so restart the dev
server after changing it.

## Using it

1. **Upload a rigged model.** `.glb`, `.gltf`, `.fbx`, or a `.zip` holding a
   model with its textures (a Sketchfab download works as-is). Mixamo is the
   easiest way to rig something that is not already rigged.
2. Two copies appear side by side: the **initial state** on the left, the
   **final state** on the right. Pose either by dragging its orange joints, by
   uploading a photo of a person (the pose is estimated from it), or both.
   **Define** saves the pose you have arrived at.
3. Open **Motion**. Leave the prompt empty to blend the two states, or describe
   an action — `Walking`, `A standing jump` — and the planner authors every
   pose it needs.
4. **Play** loops the result. Saved animations are listed under Motion and
   survive a reload.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit together
- [`docs/pipeline.md`](docs/pipeline.md) — what happens when you press Generate
- [`docs/decisions.md`](docs/decisions.md) — why it works this way, and what was
  tried and rejected
- [`docs/status.md`](docs/status.md) — what is verified, what is known to be
  weak, and what to do next
- [`docs/checks.md`](docs/checks.md) — the numeric checks and how to run them

The planning documents the build followed live in [`devpost/`](devpost/).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, three.js via
@react-three/fiber, Zustand, IndexedDB via idb, MediaPipe Pose Landmarker for
reading poses out of photos.
