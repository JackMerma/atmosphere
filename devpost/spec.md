---
doc: spec
status: approved
---

# Atmosphere — Technical Spec

## How This Works, In Plain Language

You open one page. You upload a 3D model file that already has a skeleton (bones) in it — something you downloaded or grabbed from a free rigged-character library like Mixamo. The browser reads that file directly (no server involved) and finds every bone it can rotate. You can spin the whole model around, or flip a switch ("Lock") and drag individual bones to see what they do.

Then you type a sentence describing a sequence of poses. That sentence goes to Gemini, which breaks it into a short list of individual pose descriptions ("sitting, looking up" → "standing" → "squinting"). For each pose in that list, the app takes a screenshot of the 3D view, sends it to Jev (the AI you're paying to use) with one question: "does this match the pose?" If Jev says no, it asks a second question: "which single bone should move, and which way?" The app makes that small move, takes another screenshot, and asks again — up to 10 times per pose. That's "convergence": small nudges toward a target, the same way you'd slowly turn a toy figure into the position you want. Once a pose is reached (or the attempts run out), the app remembers that pose as a keyframe and moves to the next one in the sequence.

When all poses are done, the browser smoothly blends between the keyframes — that part is just animation math, no AI involved — and you get a looping clip. Everything you've generated (the model, its bones, and every animation you've made) is saved in your browser itself (IndexedDB — think of it as a small database built into the browser) so it's still there if you refresh the page.

Why this shape: there's no backend database and no accounts because nothing needs to be shared between people or survive anywhere but your own browser. There's a tiny server component (a couple of API routes) only because the Jev and Gemini API keys can't safely live in browser code — everything else runs client-side.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. User opens the app → **Next.js page** renders the empty dashboard (upload prompt, no model yet).
2. User picks a `.glb`/`.gltf` file → **browser-side GLTFLoader** (three.js) parses it directly, no upload to any server. **Joint parser** walks the resulting scene graph and extracts every bone (name + hierarchy).
3. If parsing fails or no bones are found → an error message shows; nothing is saved.
4. On success → the model renders via **React Three Fiber**; the model file and its joint list are written to **IndexedDB** so a page reload can restore them without re-uploading.
5. User toggles **Lock** and either orbits the whole model or drags individual bones (hover shows a selection outline, drag rotates that one bone) — pure client-side three.js, no network calls.
6. User opens the **Motion modal**, types a prompt, submits.
7. The prompt goes to **`/api/motion/decompose`** → that route calls **Gemini** (JSON mode) → returns an ordered list of pose descriptions.
8. For each pose description, the client runs the **convergence loop**: render the canvas to an image → POST it plus the pose text and the model's current joint list to **`/api/motion/step`** → that route calls **Jev** (Noul, then conditionally Choice) → returns match status and, if needed, one joint adjustment → the client applies it and loops, up to 10 iterations, then moves to the next pose.
9. Converged poses become keyframes; the client interpolates between them (three.js `AnimationClip`/manual tweening) to produce a smooth loop.
10. The finished animation (its keyframes) is saved as a new entry in the **Animations history**, written to IndexedDB, and shown at the top of the history panel.
11. User presses **Play** → the active animation (from history) loops on the model.

## Stack

- **Next.js 15 (App Router), TypeScript, React 19** — one framework for the UI and for the two small backend routes (Jev/Gemini proxies), so there's a single `npm run dev` and no separate server process to manage. [nextjs.org/docs](https://nextjs.org/docs)
- **three.js** — the 3D engine (loading the model, rendering, rotating bones). [threejs.org/docs](https://threejs.org/docs/)
- **@react-three/fiber** — lets the 3D scene be written as React components, so Lock state, hover/selection, and the active animation all live in normal React/Zustand state instead of being hand-synced with an imperative three.js scene. Learner-agreed tradeoff: one more concept to learn, in exchange for far less manual sync code. [docs.pmnd.rs/react-three-fiber](https://docs.pmnd.rs/react-three-fiber)
- **@react-three/drei** — small helper set on top of r3f (orbit controls, loaders); used only where it saves hand-written three.js boilerplate.
- **Zustand** — holds the loaded model's joints, Lock state, selected history entries, and in-flight generation status, shared across the viewport and the side panels without prop drilling. [zustand docs](https://zustand.docs.pmnd.rs/)
- **Tailwind CSS** — utility classes for the Heron-inspired UI shell (cream background, hairline borders, condensed uppercase type). [tailwindcss.com/docs](https://tailwindcss.com/docs)
- **idb** (small wrapper over the browser's IndexedDB) — for storing the model file, joint map, and animations history across reloads. [github.com/jakearchibald/idb](https://github.com/jakearchibald/idb)
- **Google Fonts: Archivo Black (headlines), JetBrains Mono (labels)** — matches the Heron reference's condensed-caps/monospace-label character.

**Unverified, check early in the build:**
- Exact current Gemini model name for JSON-mode structured output — the pattern (`responseSchema` + `responseMimeType: "application/json"` on `generateContent`) is documented, but the specific model id should be confirmed against the live model list, not assumed. [ai.google.dev/gemini-api/docs/json-mode](https://ai.google.dev/gemini-api/docs/json-mode)
- Jev's exact per-image token count — pricing is confirmed ($0.042/M input tokens, output free), but the image-token estimate used in this spec's cost math is a conservative guess, not an official number.

## Where It Runs and How Someone Tries It

Runs entirely locally for this PoC — no deployment.

- **Requirements:** Node.js (LTS), a `TYPESAFE_API_KEY` (Jev) and a `GEMINI_API_KEY`, both in `.env.local` (gitignored).
- **Start command:** `npm install` then `npm run dev`, open `http://localhost:3000`.
- **To demo:** upload a rigged `.glb` (e.g. from Mixamo's free library), toggle Lock and drag a bone to show manual control, open Motion, type a multi-pose prompt, watch the convergence loading state, then press Play on the result. Record this flow for the submission video.
- Submission requires the demo video and a public GitHub repository; no deployed URL is required or planned for this PoC.

## Look and Feel

Carried from `prd.md > Look and Feel` and `scope.md > Inspiration & Identity` — reference: [heronaiapp.com](https://heronaiapp.com/).

- **Palette:** warm cream background (`#f2eee3`-ish), near-black text, one bold accent (orange-red, `#ff4d1a`-ish) — implemented as Tailwind theme tokens.
- **Typography:** Archivo Black (or similar bold condensed caps) for headings; JetBrains Mono, letter-spaced, for labels/nav/buttons.
- **Structure:** 1px hairline borders (`border-black/90`), small CSS-drawn corner brackets on cards and panels (pseudo-element technique), thin dividers between sections. No shadows, no rounded corners beyond a 2px radius.
- **The 3D model itself is unstyled by Atmosphere** — it renders with whatever materials/textures the uploaded file carries. Only the UI chrome around the viewport (panels, buttons, history list) uses the Heron palette/type.
- **Joint highlight:** a thin outline/selection indicator (e.g. `three.js` `EdgesGeometry` or a simple bounding highlight) rendered over the hovered bone's associated mesh region — never a material color override, since the model's materials belong to the uploaded asset.

## Components

### Model Upload & Joint Parser
Client-side file input → `GLTFLoader` (three.js) parses the `.glb`/`.gltf` into a scene graph → a parser walks it for `THREE.Bone` nodes, building an ordered joint list (`{ name, id }`). Writes the parsed model + joint list to IndexedDB on success; shows an error state on failure or an empty joint list.
PRD ref: `prd.md > Model Upload & Joint Mapping`.

### Rig Viewport & Manual Manipulation (Lock)
An `@react-three/fiber` `<Canvas>` rendering the loaded model. Lock state (Zustand) switches pointer behavior between whole-model `OrbitControls`-style rotation and per-bone raycasting (hover → highlight, drag → rotate that bone's `THREE.Object3D.rotation`).
PRD ref: `prd.md > Manual Joint Exploration (Lock)`.

### Motion Orchestration
Two parts:
- **Pose decomposition** (`/api/motion/decompose`): takes the raw prompt, calls Gemini with a JSON schema (`{ poses: string[] }`), returns the ordered list of pose descriptions.
- **Convergence loop** (client-driven, calling `/api/motion/step` per iteration): for each pose description, repeatedly renders the current canvas to a data URL, posts it with the pose text and current joint list to the server route, which calls Jev (Noul match-check, then Choice adjustment if unmatched) and returns the result; the client applies the adjustment and loops, capped at 10 iterations (configurable constant), then records the best-reached pose as a keyframe.
PRD ref: `prd.md > Motion Generation (Jev Convergence)`.

### Animations History & Playback
Each completed motion generation (its ordered keyframes) is appended to a Zustand-held, IndexedDB-persisted list, newest first, labeled "Animation N". Selecting an entry sets it active; Play interpolates and loops the active entry's keyframes on the loaded model.
PRD ref: `prd.md > Animations History & Playback` (Playback section).

### Persistence Layer
Thin wrapper (`lib/db.ts`, using `idb`) around three IndexedDB stores: `model` (the uploaded file blob + parsed joint list), `animations` (history entries), and app metadata. Read on app load to restore state without re-upload; written whenever the model or history changes.
PRD ref: `prd.md > States and Boundaries` (Persistence).

## Data Model

All client-side, in IndexedDB (no server database):

- **`model`** — `{ fileBlob, fileName, joints: [{ name, id, parentId }] }`. One record; replaced when a new model is uploaded.
- **`animations`** — list of `{ id, label ("Animation N"), createdAt, keyframes: [{ poseDescription, jointAngles: { [jointId]: { x, y, z } } }] }`. Appended to, never overwritten; this is what the history panel reads and what Play interpolates.

State that does **not** persist: in-progress Lock/hover selection, modal open/closed state, loading/progress indicators — these reset on reload, which is expected and fine (PRD only requires the model and generated history to survive).

## File Structure

```
atmosphere/
├── app/
│   ├── page.tsx                      # The single dashboard screen
│   ├── layout.tsx
│   ├── globals.css                   # Tailwind + Heron palette/type tokens
│   └── api/
│       └── motion/
│           ├── decompose/route.ts    # Prompt -> ordered pose list (Gemini)
│           └── step/route.ts         # One convergence iteration (Jev: Noul + Choice)
├── components/
│   ├── ModelUpload.tsx               # File picker, triggers client-side GLTF parse
│   ├── RigViewport.tsx               # r3f <Canvas>: model, Lock/hover/drag logic
│   ├── LockToggle.tsx
│   ├── MotionModal.tsx               # Prompt input, drives decomposition + convergence
│   ├── AnimationsHistoryPanel.tsx
│   └── PlayButton.tsx
├── lib/
│   ├── jevClient.ts                  # Server-side wrapper for TypeSafe /v1/systemone
│   ├── geminiClient.ts               # Server-side wrapper for Gemini generateContent (JSON mode)
│   ├── gltfJoints.ts                 # Walks a loaded GLTF scene, extracts the joint list
│   ├── convergence.ts                # Client-side orchestration of the per-pose iterate loop
│   └── db.ts                         # IndexedDB helpers (model, animations) via `idb`
├── store/
│   └── useAtmosphereStore.ts         # Zustand: model, joints, Lock state, histories, active animation
├── devpost/                          # Devpost learning workspace (this plan)
├── .env.local                        # TYPESAFE_API_KEY, GEMINI_API_KEY (gitignored)
├── package.json
└── README.md
```

## External Services and Dependencies

### Jev (TypeSafe AI) — pose matching and adjustment decisions
- **Endpoint:** `POST https://api.typesafe.ai/v1/systemone`
- **Auth:** API key in request header (server-side only, via `/api/motion/step`).
- **Calls used:** one **Noul** question per iteration ("does the rendered pose match `<description>`?", image passed as an `assets` entry) → `{ noul: 0–1 }`; if below threshold, one **Choice** question ("which single adjustment gets closest?", options built from the model's live joint list × a small fixed set of direction/step combinations) → `{ choice, confidence }`.
- **Docs:** [docs.typesafe.ai](https://docs.typesafe.ai) (question types), image support at [docs.typesafe.ai/images](https://docs.typesafe.ai/images).
- **Cost:** $0.042 per million input tokens, output free; a full 10-iteration pose is roughly $0.001–0.003 even under conservative image-token assumptions — negligible against the learner's existing $5 credit. [Source](https://www.eesel.ai/blog/typesafe-jev-pricing)
- **Key:** already obtained by the learner (TypeSafe console, named "atmosphere").

### Gemini — prompt decomposition
- **Call:** `generateContent` with `responseMimeType: "application/json"` and a `responseSchema` describing `{ poses: string[] }`.
- **Docs:** [ai.google.dev/gemini-api/docs/json-mode](https://ai.google.dev/gemini-api/docs/json-mode)
- **Key:** learner already has a Gemini API key from prior projects.
- **Model name:** to confirm against the live model list at build time (see Stack, Unverified).

## Important Failure Modes

- **Uploaded file has no skeleton / fails to parse** → show an error message inline on the upload control; nothing is written to IndexedDB; user can pick another file immediately.
- **Jev or Gemini call fails or times out mid-generation** → stop the current generation, show a plain error message, leave any already-converged poses from earlier in the sequence out of the saved result (no partial/corrupt history entry is written).
- **Convergence never reaches a confident match within 10 iterations** → use the best pose reached (highest Noul confidence seen) as that pose's keyframe and continue to the next pose, rather than stalling the whole generation.

## What Was Simplified and Why

- **Browser-side IndexedDB instead of a server database** — nothing needs to be shared between users or survive beyond one browser; a server DB would add infrastructure with no product benefit here.
- **Joint adjustments from a small fixed set of direction/step options (not continuous angles)** instead of asking Jev for an exact rotation value — Jev's API only supports Choice/Score/Noul, not arbitrary numeric output; the fuller version (continuous control) would need a different kind of model entirely.
- **A capped, fixed-step convergence loop (10 iterations, 15°-ish steps)** instead of a physics-aware or learned controller — keeps cost and latency bounded and predictable for a PoC; a fuller version would tune step size and iteration count per joint type.
- **Prompt decomposition via one Gemini JSON call** instead of a hand-written parser — more robust to varied phrasing than a comma/keyword split, at the cost of one more external dependency the learner already has a key for.
- **No re-texturing/appearance generation at all** — the uploaded model's own look is used as-is; the earlier reference-photo-driven layering idea is deferred (see `prd.md > Deferred From the POC`), because it was the hardest, least-resolved part of the original plan.

## Decisions and Open Issues

- **Pivot from a custom-built mannequin + photo-driven layering to an uploaded, already-rigged model** — decided across `scope.md`/`prd.md` during this session; carried into this spec as the foundation for every component above.
- **Jev can't output continuous values** — the one genuine uncertainty resolved during this session: initial assumption was that Jev could be asked directly for joint angles; checking `docs.typesafe.ai`'s question-type reference showed only Choice/Score/Noul exist, which led to the iterative convergence design (Noul to check, Choice to adjust) instead of a single-call "give me the angle" approach. This is the mechanism the learner specifically wanted to understand, and it's now grounded in the actual, verified API surface rather than an assumption.
- **Jev's per-image token cost is estimated, not official** — TypeSafe hasn't published exact image-token pricing; the cost estimate in this spec uses a deliberately high assumption and still lands under a cent per pose. Verify against the first real API response early in the build (`usage.input_tokens` on the first call).
- **Gemini model name** — to confirm at build start against the live model list; the JSON-mode request shape is otherwise documented and stable.
- **Exact axis/direction options offered to Jev's Choice question per joint** — this spec assumes a small fixed set (e.g. a couple of axes × two directions × one step size) per joint; the right set depends on how typical rigged models (e.g. Mixamo exports) author their bone rotations, which is easiest to confirm by inspecting a real model early in the build rather than guessing further here.
- **Default iteration cap (10) and convergence confidence threshold** — starting values, explicitly tunable once real convergence behavior is visible (carried from `prd.md > Open Questions`).
