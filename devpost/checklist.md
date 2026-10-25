---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

Commit convention: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.) — applies to every commit below.

## Slices

- [x] **1. Upload a rigged humanoid model and see its real joints**
  Becomes usable: Open the app, upload a rigged `.glb` (e.g. from Mixamo), see it rendered standing in its default pose, normalized to a consistent scale and grounded. An invalid file, or a rig not recognized as humanoid, shows an error instead of crashing.
  Why now: This is the first real technical risk (GLTFLoader + bone extraction + humanoid recognition) and nothing else can exist without it. Includes project bootstrapping (Next.js, TypeScript, Tailwind, R3F canvas, Zustand store).
  PRD ref: `prd.md > The Core Journey` (steps 1-3), `prd.md > Model Upload & Joint Mapping`, `prd.md > States and Boundaries` (First use, Upload error)
  Spec ref: `spec.md > Components > Model Upload & Joint Parser`, `spec.md > Stack`, `spec.md > File Structure`
  Build: Scaffold the Next.js app; `GLTFLoader` parses the `.glb` client-side; `gltfJoints.ts` walks the scene graph for `THREE.Bone` nodes; `humanoidRig.ts` recognizes a Mixamo-style humanoid rig by bone names; `modelLoader.ts` normalizes scale and grounds the model; error state for parse failure, no bones, or a non-humanoid rig.
  Verify (mechanical): `npm run dev` starts clean; upload a real Mixamo `.glb` and confirm the joint count and humanoid recognition; upload an invalid or unrigged file and confirm the error path. `checks/formats.ts` confirms a model loads, normalizes to a consistent height, and is recognized as a humanoid.
  Learner check: Open the app, upload a rigged model from Mixamo, confirm it renders standing and grounded.
  Commit: `feat: scaffold app and implement model upload with joint parsing`

- [x] **2. Direct joint manipulation and persistence across reload**
  Becomes usable: Every joint is always visible on the model and directly draggable — no mode to switch on first. Dragging a joint rotates it and the handle follows the cursor exactly; the uploaded model and its joint map survive a page reload, while a dragged pose does not (a fresh load always shows the model at rest).
  Why now: Completes the "explore by hand" step of the core loop while the state shape is still simple, and lands persistence before Motion generation needs the same mechanism.
  PRD ref: `prd.md > Direct Joint Manipulation`, `prd.md > States and Boundaries` (Persistence)
  Spec ref: `spec.md > Components > Direct Joint Manipulation`, `spec.md > Data Model`
  Build: `JointHandles.tsx` draws a handle at every joint; dragging projects the cursor onto a camera-facing plane and rotates the dragged joint's parent bone (`lib/boneMath.ts`), so the handle itself follows the cursor; `lib/db.ts` (IndexedDB) persists the model and joint map, written on upload and read on mount.
  Verify (mechanical): drag a joint and confirm only that joint rotates and the handle tracks the cursor (measured: releasing at a given screen point leaves the handle within a few pixels of it, at any camera angle); reload the page after an upload and confirm the model and joints restore without re-uploading, and that any dragged pose resets to rest.
  Learner check: Drag a joint and watch it follow your cursor; refresh the page and confirm the model is still there.
  Commit: `feat: add manual joint manipulation and model persistence`

- [x] **3. Physics layer — joint limits, chain reaction, self-collision**
  Becomes usable: A Physics panel with three dials (joint-limit strength, chain-reaction strength, collision strength). Every pose the app ever shows — a hand drag now, a generated pose later — is run through the same anatomical limits and self-collision resolution, so limbs can't bend past a believable range or pass through the body.
  Why now: Isolates the physics math as its own risk, grounded in real per-model measurements, before any AI-generated pose exists to rely on it.
  PRD ref: `prd.md > Physics Configuration`
  Spec ref: `spec.md > Components > Physics Configuration`
  Build: `lib/jointLimits.ts` measures each model's own anatomical ranges at rest (swing/twist split, hinges blocked from hyperextending or bending sideways) and scales them by its dial; `lib/collision.ts` resolves capsule self-collision scaled by its own dial; `lib/ikChain.ts` spreads a hand-drag up the chain scaled by its dial; `lib/settle.ts` (`settlePose`) is the one entry point every pose passes through; `lib/anchor.ts` keeps the hips exempt from automatic rotation.
  Verify (mechanical): `checks/limits.ts` confirms the dial is monotone (a 120° knee twist clamps to 35°/108°/120° at strength 1/0.5/0) and a legal pose is left untouched; `checks/physics.ts` confirms overlapping limbs are detected and separated, and that a drag decays up the chain without ever reaching the hips.
  Learner check: Drag a limb hard into the torso and watch it get pushed clear instead of clipping through; move the dials and see the effect change.
  Commits: built incrementally — joint-limit strength dial, self-collision and chain coupling, and exposing all three as adjustable dials (see `git log`).

- [x] **4. A prompt becomes a judged, real pose (Plan, Match, Judge)**
  Becomes usable: Submitting a motion prompt plans a titled pose, matches it against a real, pre-harvested library of motion-captured poses, has Jev judge the closest real candidates on a stand-in body from four angles, and applies the winner to the user's own model under real physics — proven on one generated pose, with a visible loading state.
  Why now: This is the project's unique kernel and its highest-risk integration (the planner's structured output, the harvested pose vocabulary, and Jev's judging call). Proving it on one pose before chaining several keeps a failure here from contaminating the whole pipeline.
  PRD ref: `prd.md > Motion Generation (Plan, Match, Judge)`
  Spec ref: `spec.md > Components > Motion Generation (Plan, Match, Judge)`, `spec.md > External Services and Dependencies`
  Build: `POST /api/motion/plan` calls OpenAI (`gpt-4.1-mini`) for a titled, structured pose plan; `scripts/harvest.ts` builds `public/poseLibrary.json` from Mixamo animation files into 200+ real poses; `lib/poseLibrary.ts` measures distance between poses; `lib/libraryChoice.ts` shortlists the ranked-poses nearest, poses them on the stand-in mannequin (`lib/mannequin.ts`), photographs each from four angles (`lib/viewAngles.ts`), and runs the knockout via `POST /api/motion/rank` (Jev); every chosen pose passes through `settlePose`.
  Verify (mechanical): `checks/knockout.ts` confirms the knockout always lands on exactly one pose within a bounded question count, for any setting of the three sliders; `checks/library.ts` confirms the pose-distance metric is real and that a harvested pose re-applies correctly to a different skeleton. Run end to end against the real API: Jev twice preferred a further pose from the correct animation over the numerically nearest alternative (see `docs/decisions.md`).
  Learner check: Submit a single-action prompt, watch the loading state, and see the model move into a real, judged pose.
  Commits: built incrementally — pose harvesting, the OpenAI planner, the mannequin/four-angle judging setup, and the plan/rank knockout (see `git log`).

- [x] **5. Full pipeline: multi-pose sequencing, history, and tracked playback**
  Becomes usable: A multi-pose prompt plans and judges pose after pose, mirrors symmetric cycles automatically, saves as a new AI-titled entry in Animations history, and plays back in a loop with a tracking camera following the model — all persisting across reload. Unlimited regeneration.
  Why now: Every risky piece (upload, physics, single-pose generation) is proven in isolation; this slice composes them into the actual product and is the "oh, that's cool" moment.
  PRD ref: `prd.md > The Core Journey` (steps 6-11), `prd.md > Animations History & Playback`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Components > Animations History & Playback`, `spec.md > Data Model`, `spec.md > Important Failure Modes`
  Build: the planner returns the full pose sequence per prompt, with loop/mirror flags; mirrored halves are derived by reflection rather than re-chosen; `lib/timeline.ts` walks the saved keyframes each frame (slerped with easing/hold, each joint trailing the one above it, grounded poses stood on the lowest foot); `lib/animations.ts` + `lib/db.ts` save/restore history (bone-traversal order, not bone id, since ids regenerate on every parse); `FollowCameraView.tsx` renders a tracking picture-in-picture view during playback via a second scissored `gl.render()` call.
  Verify (mechanical): `checks/timeline.ts` confirms every keyframe is reached exactly, amplitude is monotone, and the drag/spacing dials behave as specified; `checks/mirror.ts` confirms a mirrored cycle is symmetric and mirroring twice is the identity; `checks/grounding.ts` confirms the feet stay planted through a crouch. Measured against the real API for a 5-pose plan: 25 rank calls, 0 errors, 63s total. The follow-camera was re-verified after a pixel-ratio fix at a forced `devicePixelRatio` of 2.5.
  Learner check: Run the whole flow — upload, drag a joint, submit a multi-pose prompt, watch it generate, press Play, watch the tracking camera, reload the page, and confirm the animation is still there.
  Commits: built incrementally — the full planner/mirroring pipeline, the shared playback timeline, and the follow-camera mini-view (see `git log`).

- [x] **6. Heron-inspired visual identity**
  Becomes usable: The dashboard reads as Atmosphere's actual visual identity — warm cream background, bold condensed caps type, one accent color, hairline borders with corner-bracket accents — across every screen state, with a full-bleed 3D viewport and a floating control panel.
  Why now: Deliberately last — visual identity gates no functional risk, and real detail is easiest to judge once the build is visible.
  PRD ref: `prd.md > Look and Feel`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Look and Feel`
  Build: Tailwind theme tokens for the cream/near-black/accent palette; Archivo Black and JetBrains Mono; 1px hairline borders with CSS corner-bracket accents (`CornerBrackets.tsx`); full-bleed viewport with auto camera framing; joint highlight kept a non-destructive indicator, never a material override.
  Verify (mechanical): Visually inspect every screen state (empty/upload prompt, loaded model, Physics/Motion panel open, history populated, playback with the tracking camera) against the palette, type, and border rules above.
  Learner check: Look at the whole dashboard end to end and compare it against heronaiapp.com's feel; flag anything off.
  Commit: `feat: apply Heron-inspired visual identity to dashboard UI`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after Slice 2 (upload, orbit, direct joint drag, and reload persistence all working — enough real product to react to before the AI pipeline is built on top of it)
- [x] Final kick-the-tires exploration and feedback completed

## Final Review

- [x] Final review complete — feedback resolved and learner confirms ready to ship

Mechanical verification before the kick-the-tires session: all numeric checks (`checks/limits.ts`, `physics.ts`, `mirror.ts`, `timeline.ts`, `knockout.ts`, `formats.ts`, `grounding.ts`, `library.ts`, `airborne.ts`) pass against the real fixtures and the real 296-pose library; the app serves and responds at `localhost:3000`.

Learner's kick-the-tires feedback: the system works well end to end and the UI reads well at laptop size; simple actions (jump, sit, walk) produce convincing animations. Three rough edges, all accepted as known limitations rather than fixed now:
- The Physics/Motion dials are not self-explanatory — a first-time user wouldn't know how to tune them well.
- More elaborate, "produced" prompts can return an animation that doesn't read as coherent motion; only simple actions were confirmed to work well.
- The UI isn't responsive outside laptop-sized viewports, and working directly with some 3D models' joints showed limits the learner hadn't fully characterized.

Agreed outcome: no changes requested — the learner confirmed the current build is ready to present as-is, with these points recorded as known limitations (see `docs/status.md > What is weak, and known`, and `prd.md > Known Limitations`) rather than fixed in this pass.

## Code Tour and App Map

- [x] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [x] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: Focused alternative (learner is an experienced, recently plan-first dev — see `learner-profile.md`). Used a real decision already on record in `docs/decisions.md` ("Jev ranks candidates; it does not score them") — an absolute 0–1 match score sat low and barely moved against the real API, so hill-climbing it was close to random search; switching to a ranking question ("which of these is best") fixed it. Paired with this very session's own parallel case: reopening `scope.md`/`prd.md`/`spec.md`/`checklist.md` when the real, working build no longer matched the planned Jev-convergence mechanism. This largely already happened during the session rather than being staged as a fresh exercise, so it's recorded as an evidence-based recap, not a live interactive tour.
Route and stops: Reference-only route (not toured live in the editor this session) — `components/MotionSection.tsx` / `lib/animator.ts` (entry) → `lib/plannerClient.ts` + `app/api/motion/plan/route.ts`, then `lib/libraryChoice.ts` + `app/api/motion/rank/route.ts` (logic) → `lib/settle.ts` → `lib/animations.ts`/`lib/db.ts` → `components/PlaybackDriver.tsx` (result). Captured in `devpost/app-map.html`.
Edit outcome: Not applicable — no code edit was part of this wrap-up; the project's own working code was the evidence used.
Reflection: Offered in chat ("what would you do differently next time you start a project with an agent?"); the learner moved on without answering — recorded as declined, which the practice guide treats as complete.
Activity mode: Focused alternative / evidence-based recap, grounded in `docs/decisions.md` and this session's own planning-doc reconciliation.

## Revisions

- Removed the scaffold's `prefers-color-scheme: dark` CSS override — it silently flipped the background/foreground tokens to near-black/near-white whenever the OS was in dark mode, making all text invisible against the light panels. This app has one fixed Heron-inspired light identity, not an adaptive dark mode.
- The 3D viewport is the full-screen background (with a 2D grid floor), with the upload/filename controls in a single floating panel, top-right, over the canvas. Camera auto-fits to whatever model is uploaded, fixing a cropping issue on taller models.
- Joint dragging projects the cursor onto a camera-facing plane and rotates the **parent** bone of the dot being dragged — not the dot's own bone — which is what makes the dot itself track the cursor exactly rather than appearing to resist it. Verified by measurement: releasing at one screen point leaves the handle within a few pixels of it, at any camera orbit angle.
- Joint handles are always visible and always directly draggable — no mode to switch on first, and no separate step to select a joint before moving it. Camera orbit is always free; only the handle actively being dragged suspends orbit for that one gesture, via a shared `isDraggingJoint` flag, so posing and looking around never fight each other.
- Added a live debug filmstrip (`store/useDebugFilm.ts`, `components/DebugFilmstrip.tsx`) along the bottom of the screen: every photograph taken of every candidate Jev judges is pushed to it the instant it's captured, grouped by planner pose then by candidate, collapsed by default. Purely observational — nothing in the pipeline reads it back — and not part of what this version presents to a reviewer (see `prd.md > Deferred From the POC`).
- UX pass verified against a real generation: fixed filmstrip title-slot alignment, moved Physics/Motion to one shared `openPanel` field so they behave as an exclusive accordion, added AI-authored one-or-two-word animation titles, and raised the defaults to chain reaction 5%, joint limits 50%, ranked poses 25, batches 5 (collisions and options-per-query were already at 100%/4).
- Fixed an unintended horizontal scrollbar on the config panel, and found that the camera was never actually disabled during generation — what read as a locked camera was the main thread pinned by a synchronous capture burst, fixed with one yield point per candidate rather than touching the orbit controls' `enabled` prop.
- Added the follow-camera picture-in-picture mini-view (`components/FollowCameraView.tsx`, `FollowCameraFrame.tsx`, `lib/followViewLayout.ts`), shown only during playback: a second camera tracks the stage model's live world position every frame, rendered via a second `gl.render()` call scissored into the same canvas/renderer/scene (not a second `<Canvas>`, since a `THREE.Object3D` can only have one parent).
- Fixed a dual-monitor bug in that mini-view: `gl.setViewport`/`gl.setScissor` already multiply by the renderer's pixel ratio internally, and the code was multiplying by it a second time — invisible at ratio 1, but it pushed the rect outside the framebuffer on a display with a different scale factor. Fixed by passing raw CSS-pixel values through once; re-verified at a forced `devicePixelRatio` of 2.5. Also removed the config panel's scroll entirely — Physics/Motion are an exclusive accordion and the animation list scrolls within its own fixed height, so the panel has no real reason to outgrow the screen.
