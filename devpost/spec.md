---
doc: spec
status: approved
---

# Atmosphere — Technical Spec

## How This Works, In Plain Language

You open one page. You upload a `.glb` file of an already-rigged humanoid model — something you downloaded or grabbed from a free rigged-character library like Mixamo. The browser reads that file directly (no server involved) and finds every bone it can rotate, and checks that the bone names look like a human skeleton. Every joint shows up as a small dot on the model that you can grab and drag directly, any time, just to see what the rig can actually do.

A side panel has two sections. **Physics** has three sliders: how strictly a joint keeps to a believable human range, how much a drag pulls on the joints above it, and how firmly overlapping limbs get pushed apart. **Motion** has the prompt box and three more sliders that shape the next part.

You type a sentence describing a motion and hit Generate. An AI (OpenAI) reads it and writes out the whole thing as a short list of poses — not vague descriptions, but exact numbers for where every limb should point, plus how important each limb is to that particular pose, plus a plain-language caption. For each of those poses, the app doesn't invent a body — it reaches into a library of 200+ real poses pulled from real motion-capture animation files, and measures which ones are closest to what the AI asked for. The closest handful get posed onto a plain stand-in body (never your own model) and photographed from four sides. Then Jev — the AI you're paying to use — looks at that small set of photos and picks whichever one actually looks right. That's the "judge": it never invents a pose, it only picks the best real one on offer. Whichever poses win get stitched into an animation and applied to your own model's own joints, with the Physics rules from the panel keeping every pose believable.

The result saves into an animations list, titled automatically, and you can make as many as you want — each one gets its own entry, nothing overwrites. Press Play and it loops on your model; while it plays, a small second camera view tracks the model so a big movement never drifts out of frame, even if your own view is looking somewhere else.

Why this shape: there's no backend database and no accounts because nothing needs to be shared between people or survive anywhere but your own browser. There's a small server component (two API routes) only because the OpenAI and Jev keys can't safely live in browser code — everything else, including the whole 3D scene and the physics, runs client-side.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. User opens the app → **Next.js page** (`app/page.tsx`) renders the empty dashboard (upload prompt, no model yet).
2. User picks a `.glb` file → **browser-side `GLTFLoader`** (three.js) parses it directly, no upload to any server. `gltfJoints.ts` walks the resulting scene graph for every `THREE.Bone`; `humanoidRig.ts` checks the bone names against a Mixamo-style humanoid convention; `modelLoader.ts` normalizes the model's scale and stands it on the floor.
3. If parsing fails, no bones are found, or the rig isn't recognized as humanoid → an error message shows; nothing is saved.
4. On success → the model renders via **React Three Fiber**; the model and its joint list are written to **IndexedDB** (`lib/db.ts`) so a page reload can restore them without re-uploading.
5. User drags any joint handle directly on the model to confirm it responds — pure client-side math (`JointHandles.tsx`, `lib/boneMath.ts`), no network call, and nothing from this is saved.
6. User opens the **Physics**/**Motion** panel (an exclusive accordion — opening one closes the other), adjusts the three Physics dials and the three Motion dials, and types a motion prompt.
7. User presses **Generate** → `lib/animator.ts` calls **`POST /api/motion/plan`** → that route calls **OpenAI** (`gpt-4.1-mini`) → returns a title, a duration, loop/mirror flags, and an ordered list of poses, each a direction vector per body segment plus a per-segment importance weight and a caption.
8. For each planned pose, `lib/libraryChoice.ts` measures it against the pre-harvested pose library (`public/poseLibrary.json`), keeps the nearest candidates (count set by the **ranked poses** dial, each required to differ from the others already kept), poses them on the stand-in mannequin, and photographs each from four angles.
9. The shortlist goes through a knockout: **`POST /api/motion/rank`** → that route calls **Jev**, asking "which of these is best" across however many candidates the **options per query** dial allows, running the **batches** dial's worth of comparisons at once, until one candidate per pose remains.
10. Every chosen pose — and the mirrored second half, when the plan loops symmetrically — passes through `settlePose` (`lib/settle.ts`): joint limits, then self-collision, repeated until the body is clear.
11. The finished animation is saved as a new, titled entry in the **Animations history**, written to IndexedDB, and shown at the top of the history panel.
12. User presses **Play** → `PlaybackDriver` walks the saved keyframes on the model, and a small tracking-camera view appears alongside the panel for as long as it plays.

## Stack

- **Next.js 16 (App Router), TypeScript, React 19** — one framework for the UI and for the two small backend routes (OpenAI/Jev proxies), so there's a single `npm run dev` and no separate server process. [nextjs.org/docs](https://nextjs.org/docs)
- **three.js** — the 3D engine (loading the model, rendering, rotating bones, the physics math). [threejs.org/docs](https://threejs.org/docs/)
- **@react-three/fiber** — the 3D scene as React components, so joint state and the active animation live in normal React/Zustand state instead of hand-synced imperative three.js. [docs.pmnd.rs/react-three-fiber](https://docs.pmnd.rs/react-three-fiber)
- **@react-three/drei** — small helper set on top of r3f (camera framing, loaders); used only where it saves hand-written three.js boilerplate.
- **Zustand** (`store/useAtmosphereStore.ts`) — the loaded model, the Physics/Motion dial values, the animations history, and in-flight generation status, shared across the viewport and the panel without prop drilling.
- **Tailwind CSS** — utility classes for the Heron-inspired UI shell (cream background, hairline borders, condensed uppercase type). [tailwindcss.com/docs](https://tailwindcss.com/docs)
- **idb** (small wrapper over the browser's IndexedDB) — for storing the model file, joint map, and animations history across reloads. [github.com/jakearchibald/idb](https://github.com/jakearchibald/idb)
- **Google Fonts: Archivo Black (headlines), JetBrains Mono (labels)** — matches the Heron reference's condensed-caps/monospace-label character.

## Where It Runs and How Someone Tries It

Runs entirely locally for this PoC — no deployment.

- **Requirements:** Node.js (LTS), an OpenAI API key and a Jev (TypeSafe) API key, both in `.env.local` (gitignored).
- **Start command:** `npm install` then `npm run dev`, open `http://localhost:3000`.
- **To demo:** upload a rigged humanoid `.glb` (e.g. from Mixamo's free library), drag a joint to show it respond, open the Physics and Motion sections, type a prompt like "jump" or "walk", watch the Generate loading state, then press Play and watch the tracking camera pick up the motion. Record this flow for the submission video.
- Submission requires the demo video and a public GitHub repository; no deployed URL is required or planned for this PoC.

## Look and Feel

Carried from `prd.md > Look and Feel` and `scope.md > Inspiration & Identity` — reference: [heronaiapp.com](https://heronaiapp.com/).

- **Palette:** warm cream background (`#f2eee3`-ish), near-black text, one bold accent (orange-red, `#ff4d1a`-ish) — Tailwind theme tokens.
- **Typography:** Archivo Black (or similar bold condensed caps) for headings; JetBrains Mono, letter-spaced, for labels/nav/buttons.
- **Structure:** 1px hairline borders, small CSS-drawn corner brackets on cards and panels (`CornerBrackets.tsx`), thin dividers between sections. No shadows, no rounded corners beyond a 2px radius.
- **The 3D model itself is unstyled by Atmosphere** — it renders with whatever materials/textures the uploaded file carries. Only the UI chrome (panel, buttons, history list) uses the Heron palette/type.
- **Joint handles:** small, always-visible, non-destructive dots on the model; the one currently held highlights, never a material color override, since the model's materials belong to the uploaded asset.

## Components

### Model Upload & Joint Parser
Client-side file input → `GLTFLoader` (three.js) parses the `.glb` into a scene graph. `gltfJoints.ts` walks it for `THREE.Bone` nodes into an ordered joint list; `humanoidRig.ts` recognizes a humanoid rig from its bone names (Mixamo-style, `_L`/`_R`, `ArmL` conventions); `modelLoader.ts` normalizes scale (exporters disagree on units) and stands the model on the floor. Writes the parsed model and joint list to IndexedDB on success; shows an error state on failure, an empty joint list, or a non-humanoid rig.
PRD ref: `prd.md > Model Upload & Joint Mapping`.

### Direct Joint Manipulation
`JointHandles.tsx` draws a draggable dot at every joint's world position (outside the stage group, since it tracks its bone in world space). Dragging projects the cursor onto a camera-facing plane (`lib/boneMath.ts`) and rotates the dragged joint's **parent** bone, so the dot itself follows the cursor. Optionally propagates a share of the move up the chain — see Physics Configuration below. Nothing here is saved; `lib/pose.ts` resets to rest on load.
PRD ref: `prd.md > Direct Joint Manipulation`.

### Physics Configuration
`PhysicsSection.tsx` exposes three dials, held in `store/useAtmosphereStore.ts > settings`: joint-limit strength, chain-reaction strength, and self-collision strength. `lib/jointLimits.ts` measures each model's own anatomical ranges at rest (so an A-pose and a T-pose both work) and scales them by the joint-limit dial; `lib/collision.ts` resolves capsule self-collision scaled by its own dial; `lib/ikChain.ts` spreads a hand-drag up the chain scaled by the chain-reaction dial. `lib/settle.ts` (`settlePose`) is the single entry point every pose — planned, chosen by Jev, or hand-dragged — passes through before it's shown; `lib/anchor.ts` keeps the hips exempt from any automatic rotation.
PRD ref: `prd.md > Physics Configuration`.

### Motion Generation (Plan, Match, Judge)
`lib/animator.ts` orchestrates the pipeline on Generate:
1. `lib/plannerClient.ts` calls `POST /api/motion/plan`, which calls **OpenAI** with the prompt and the model's rest pose as segment vectors; returns a title, duration, loop/mirror flags, and an ordered list of poses — each a direction vector per body segment, an importance weight per segment, and a caption.
2. For each planned pose (only the first half when the plan mirrors — the second half is the exact left/right reflection of whichever pose the first half actually lands on), `lib/libraryChoice.ts` measures it against the harvested library (`lib/poseLibrary.ts`, `public/poseLibrary.json`), keeps the **ranked poses** nearest (each required to differ from the others already kept, so the shortlist isn't several frames of the same clip), poses them on the stand-in mannequin (`lib/mannequin.ts`, `public/mannequin.glb` — never the uploaded model) and photographs each from four angles (`lib/viewAngles.ts`: front/right/back/left).
3. The shortlist goes through a knockout: `POST /api/motion/rank` calls **Jev**, comparing **options per query** candidates per round across **batches** concurrent rounds, until one candidate remains.
4. Every chosen (or mirrored) pose passes through `settlePose` before being accepted.
PRD ref: `prd.md > Motion Generation (Plan, Match, Judge)`.

### Animations History & Playback
`AnimationsHistoryPanel.tsx` lists saved entries (`lib/animations.ts`, IndexedDB via `lib/db.ts`), newest first, titled by the planner, selectable. `PlayButton.tsx` starts `PlaybackDriver.tsx`, which walks `lib/timeline.ts` each frame: keyframes are slerped with their own easing/hold, each joint reads the timeline slightly behind the one above it, `settlePose` runs once per frame, and a grounded pose stands on its lowest foot (`lib/grounding.ts`) so weight comes from the floor rather than an animated curve. `lib/motionParams.ts` holds the global playback dials (amplitude, lag, bob, arm phase, spacing) at fixed defaults for this version. `FollowCameraView.tsx`/`FollowCameraFrame.tsx` (`lib/followViewLayout.ts`) render a second, small tracking view only while playing — a second `gl.render()` into a scissored region of the same canvas/renderer/scene, not a second `<Canvas>`, since a `THREE.Object3D` can only have one parent.
PRD ref: `prd.md > Animations History & Playback`.

## Data Model

All client-side, in IndexedDB (`lib/db.ts`) — no server database:

- **`model`** — the uploaded file, its parsed joint list, and the recognized humanoid mapping. One record; replaced on a new upload.
- **`animations`** — a list of `{ id, title, createdAt, keyframes }`, each keyframe holding every bone's rotation in bone-traversal order (not by bone id — ids regenerate on every parse, so an id-keyed record would silently stop matching after a reload). Appended to, never overwritten; this is what the history panel reads and what Play walks.

State that does **not** persist: a hand-dragged pose (always resets to rest on reload), which panel is open, in-flight generation progress. The PRD only requires the uploaded model and the generated history to survive a reload, and that's what's stored.

## File Structure

```
atmosphere/
├── app/
│   ├── page.tsx                      # The single dashboard screen
│   ├── layout.tsx
│   ├── globals.css                   # Tailwind + Heron palette/type tokens
│   └── api/
│       └── motion/
│           ├── plan/route.ts         # Prompt -> titled pose plan (OpenAI)
│           └── rank/route.ts         # Knockout: best of several candidates (Jev)
├── components/
│   ├── ModelUpload.tsx               # File picker, triggers client-side GLTF parse
│   ├── RigViewport.tsx               # r3f <Canvas>: the model, the stage, playback
│   ├── ViewportBridge.tsx            # capture()/captureProxy() for judging, off-screen
│   ├── PlaybackDriver.tsx            # Drives the stage model through the active animation
│   ├── CentroidLock.tsx              # Holds the model over its mark on the stage
│   ├── JointHandles.tsx              # The draggable joint dots
│   ├── PhysicsSection.tsx            # Joint limits / chain reaction / collision dials
│   ├── MotionSection.tsx             # Prompt + ranked poses / options per query / batches
│   ├── AnimationsHistoryPanel.tsx
│   ├── PlayButton.tsx
│   ├── FollowCameraView.tsx          # Tracking picture-in-picture, shown only while playing
│   ├── FollowCameraFrame.tsx         # Its HTML border overlay
│   └── CornerBrackets.tsx            # Heron-style corner accents
├── lib/
│   ├── modelLoader.ts                # Reads .glb, normalises scale, stands it on the floor
│   ├── gltfJoints.ts                 # Walks a parsed GLTF scene for its joints
│   ├── humanoidRig.ts                # Recognises a humanoid rig from its bone names
│   ├── jointLimits.ts                # Anatomical ranges per model, scaled by its dial
│   ├── collision.ts                  # Capsule self-collision, scaled by its dial
│   ├── ikChain.ts                    # Spreads a hand-drag up the chain, scaled by its dial
│   ├── settle.ts                     # settlePose: limits -> collision -> limits
│   ├── anchor.ts                     # The hips: nothing automatic may rotate them
│   ├── grounding.ts                  # Stands the figure on its lowest foot
│   ├── boneMath.ts                   # Cursor-to-rotation projection for dragging a joint
│   ├── poseRetarget.ts               # Segment vectors <-> bone rotations, and mirroring
│   ├── poseLibrary.ts                # Distance between poses, and the nearest-N search
│   ├── libraryChoice.ts              # The knockout: Jev picks one pose from a shortlist
│   ├── mannequin.ts                  # The stand-in body every candidate is photographed on
│   ├── viewAngles.ts                 # The four camera angles a candidate is judged from
│   ├── plannerClient.ts              # Client-side call into /api/motion/plan
│   ├── animator.ts                   # Orchestrates one full Generate run, start to finish
│   ├── timeline.ts                   # The pose an animation holds at a given moment
│   ├── motionParams.ts               # The fixed playback dials (amplitude, lag, bob, …)
│   ├── jevClient.ts                  # Server-side wrapper for the Jev API
│   ├── animations.ts                 # Animation history read/write helpers
│   ├── pose.ts                       # Snapshot / restore / rest
│   ├── followViewLayout.ts           # The one rect the tracking view and its frame share
│   └── db.ts                         # IndexedDB helpers (model, animations) via `idb`
├── store/
│   └── useAtmosphereStore.ts         # Zustand: model, dials, history, active animation
├── scripts/
│   ├── harvest.ts                    # Builds public/poseLibrary.json from Mixamo animation files
│   └── mannequin.ts                  # Strips an animation file down to the stand-in body
├── checks/                           # Numeric scripts verifying the physics/matching math — see docs/checks.md
├── public/
│   ├── poseLibrary.json              # The harvested pose vocabulary (200+ poses)
│   └── mannequin.glb                 # The stand-in body
├── devpost/                          # Devpost learning workspace (this plan)
├── .env.local                        # OPENAI_API_KEY, TYPESAFE_API_KEY (gitignored)
├── package.json
└── README.md
```

A few files exist in the repo but support work that isn't part of this version's demoed story — `DualStateToggle.tsx`, `StateColumn.tsx`, `StageChoreography.tsx`, `lib/poseEstimation.ts`, and `DebugFilmstrip.tsx`/`store/useDebugFilm.ts` — left out of the tree above since they back the reference-pose and debug-view mechanisms covered in `prd.md > Deferred From the POC`, not the flow the demo walks through.

## External Services and Dependencies

### OpenAI — motion planning
- **Call:** `POST /api/motion/plan` → OpenAI `gpt-4.1-mini` with structured output, given the prompt and the model's rest pose as segment vectors; returns a title, timing, loop/mirror flags, and the ordered pose list.
- **Docs:** [platform.openai.com/docs](https://platform.openai.com/docs/)
- **Cost:** roughly $0.005 per generation — cheap and fast since the model doesn't reason, chosen for its strict structured-output support (needed to reliably return 13 direction vectors per pose).
- **Key:** `OPENAI_API_KEY` in `.env.local`, server-side only.

### Jev (TypeSafe AI) — candidate judging
- **Endpoint:** `POST https://api.typesafe.ai/v1/systemone`, proxied through `POST /api/motion/rank`.
- **Auth:** API key in request header (server-side only, via `lib/jevClient.ts`).
- **Call used:** one **Choice** question per knockout round — "which of these candidates is best" — with the current leader carried into the next round, never a raw numeric score (Jev's scores sit low and barely move, so ranking replaced scoring; see `docs/decisions.md`).
- **Docs:** [docs.typesafe.ai](https://docs.typesafe.ai)
- **Measured cost (real API run, 5-pose plan, no pose mirrored):** 25 rank calls, 0 errors, 63s total, each call 185–205KB and 425–1498ms — negligible against the learner's existing credit.
- **Key:** already obtained by the learner (TypeSafe console).

## Important Failure Modes

- **Uploaded file has no skeleton, fails to parse, or isn't recognized as a humanoid rig** → show an error message inline on the upload control; nothing is written to IndexedDB; the user can pick another file immediately.
- **OpenAI or Jev call fails or times out mid-generation** → stop the current generation, show a plain error message, and write no partial or corrupted history entry.
- **A candidate photography burst would otherwise stall the page** — posing and photographing a shortlist runs synchronously once the mannequin is cached; a yield point after each candidate keeps camera orbit and input responsive through a long generation instead of appearing to lock the viewport.

## What Was Simplified and Why

- **Browser-side IndexedDB instead of a server database** — nothing needs to be shared between users or survive beyond one browser; a server DB would add infrastructure with no product benefit here.
- **Choosing a real pose from a harvested library instead of generating one from scratch** — every candidate is a pose a real person actually held, which gives the judge a floor of real bodies to pick from rather than an AI's approximation of one to score.
- **Ranking candidates instead of scoring them** — Jev's absolute match score sits low and barely moves, which makes climbing it close to random search; asking "which of these is best," with the current pose among the options, is a question Jev answers well and is monotone by construction.
- **Global, fixed playback dials instead of per-keyframe timing controls** — per-keyframe dials would be too many to tune with a handful of generation rounds, and would let a mirrored cycle's two halves drift out of symmetry.
- **No re-texturing or appearance generation at all** — the uploaded model's own look is used as-is; this was the hardest, least-resolved part of an earlier direction and is deferred (see `prd.md > Deferred From the POC`).

## Decisions and Open Issues

- **The pipeline plans, matches, and judges, rather than searching for a pose** — the learner chose this over hill-climbing or convergence approaches specifically because real motion-capture poses give the judge a real body to choose from, and a ranking question is one Jev answers reliably where a numeric score does not. Carried into every component above.
- **Candidates are judged from four angles, not one** — settled by running it: one angle alone couldn't distinguish a crouch from standing, since that's a front-to-back/depth distinction a head-on camera can't see.
- **No new technical uncertainty surfaced in this pass** — this spec reconciles the written plan with an already-working pipeline, verified against the real OpenAI and Jev APIs (see `docs/decisions.md`, `docs/checks.md`); no open implementation question remains that blocks approval.
- Carried from `prd.md > Open Questions`: exact default values for the Physics and Motion dials remain tunable against real generations; whether the debug view or the "pin two states" mode become user-facing features is for later, not part of this POC.
