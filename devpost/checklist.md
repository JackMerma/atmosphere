---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

Commit convention: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, etc.) — applies to every commit below.

## Slices

- [x] **1. Upload a rigged model and see its real joints**
  Becomes usable: Open the app, upload a rigged `.glb` (e.g. from Mixamo), see it rendered standing in its default pose, orbit it freely (Lock off). An invalid or unrigged file shows an error instead of crashing.
  Why now: This is half the unique kernel — reading a real model's real skeleton — and the first real technical risk (GLTFLoader + bone extraction). Includes project bootstrapping (Next.js, TypeScript, Tailwind, R3F canvas, Zustand store) since nothing else can exist without it.
  PRD ref: `prd.md > The Core Journey` (steps 1-4), `prd.md > Model Upload & Joint Mapping`, `prd.md > States and Boundaries` (First use, Upload error, Degenerate rig)
  Spec ref: `spec.md > Components > Model Upload & Joint Parser`, `spec.md > Components > Rig Viewport & Manual Manipulation (Lock)` (orbit part only), `spec.md > Stack`, `spec.md > File Structure`
  Build: Scaffold the Next.js app per the spec's file structure; add a file input that runs `GLTFLoader` client-side; write a joint parser that walks the scene graph for `THREE.Bone` nodes into an ordered `{ name, id, parentId }` list; render the model in an `@react-three/fiber` `<Canvas>` with orbit rotation; show an error state for parse failure or a joint list of 0-1.
  Verify (mechanical): `npm run dev` starts with no errors; upload a real Mixamo `.glb` and confirm the console/log shows a joint count > 1 and the model renders; upload a non-rigged file (e.g. a plain `.glb` with no bones, or an unrelated file) and confirm the error path triggers instead of a crash.
  Learner check: Open the app, upload a rigged model you grabbed from Mixamo, and drag to orbit it.
  Commit: `feat: scaffold app and implement model upload with joint parsing`

- [x] **2. Manual joint exploration (Lock) and persistence across reload**
  Becomes usable: Toggle Lock on to hover/drag individual joints (with a selection highlight) instead of rotating the whole model; the uploaded model and its joint map survive a page reload.
  Why now: Completes the "explore by hand" step of the core loop while the state shape is still simple, and lands persistence before Motion/Animations need the same mechanism.
  PRD ref: `prd.md > Manual Joint Exploration (Lock)`, `prd.md > States and Boundaries` (Persistence)
  Spec ref: `spec.md > Components > Rig Viewport & Manual Manipulation (Lock)`, `spec.md > Components > Persistence Layer`, `spec.md > Data Model` (`model` store)
  Build: Add Lock state (Zustand); when on, raycast for hover (highlight indicator, not material override) and drag-to-rotate on the hovered bone; add the `idb`-backed `model` IndexedDB store; write on successful upload, read on app mount to restore without re-upload.
  Verify (mechanical): With Lock on, drag a joint and confirm only that joint rotates; reload the page after an upload and confirm the model and joint list restore without re-uploading.
  Learner check: Turn Lock on, hover a joint to see it highlight, drag it to rotate just that joint; refresh the page and confirm the model is still there.
  Commit: `feat: add manual joint manipulation and model persistence`

- [x] **3. Motion prompt decomposes into an ordered pose list (Gemini)**
  Becomes usable: The Motion button (enabled only once a model with joints is loaded) opens a modal; submitting a multi-pose prompt returns and displays the ordered list of individual pose descriptions.
  Why now: Isolates the Gemini JSON-mode risk (including confirming the live model name) before adding the heavier Jev convergence loop on top of it.
  PRD ref: `prd.md > Motion Generation (Jev Convergence)` (decomposition part), `prd.md > States and Boundaries` (Dependency boundary: Motion requires a loaded, mapped model)
  Spec ref: `spec.md > Components > Motion Orchestration` (Pose decomposition), `spec.md > Stack` (Unverified: Gemini model name), `spec.md > External Services and Dependencies > Gemini`
  Build: Add `/api/motion/decompose` calling Gemini with `responseMimeType: "application/json"` and a `{ poses: string[] }` schema; add the Motion button (disabled until joints exist) and modal with a text input; display the returned pose list.
  Verify (mechanical): Confirm the current Gemini model name against the live model list before wiring the call; POST a sample multi-state prompt (e.g. "raise the right arm, then crouch down") to the route directly and confirm it returns an ordered array of pose strings matching the sequence.
  Learner check: Open Motion, type a multi-pose prompt, submit, and see the decomposed pose list appear.
  Commit: `feat: add motion prompt decomposition via Gemini`

- [x] **4. Jev converges a single pose onto the real model**
  Becomes usable: For one pose description, the app actually drives the model's real joints toward that pose through the Jev Noul/Choice loop, capped at 10 iterations, with a visible loading state, and the model visibly moves.
  Why now: This is the other half of the unique kernel and the highest-risk external call (Jev's exact API shape, screenshot capture, generating Choice options from the model's real joint list). Proving it on one pose before chaining multiple poses keeps a failure here from contaminating the whole generation pipeline.
  PRD ref: `prd.md > Motion Generation (Jev Convergence)` (convergence loop item, loading state)
  Spec ref: `spec.md > Components > Motion Orchestration` (Convergence loop), `spec.md > External Services and Dependencies > Jev`, `spec.md > Decisions and Open Issues` (Jev can't output continuous values; per-image token cost)
  Build: Add `/api/motion/step` calling Jev (Noul match-check, then Choice adjustment if unmatched, options generated from the model's live joint list); add client-side canvas-to-image capture; add `convergence.ts` to loop for one pose description, applying each returned adjustment to the live model and capping at 10 iterations; show a loading indicator while it runs.
  Verify (mechanical): Run the loop against a real uploaded model for one simple pose (e.g. "raise the right arm"); log each iteration's Noul score and confirm it trends toward a match or exhausts the cap; confirm the joint Jev picks is actually one from that model's joint list and that it visibly rotates.
  Learner check: Submit a single-pose prompt, watch the loading state, and see the model move toward the described pose.
  Commit: `feat: implement Jev convergence loop for single-pose motion`

- [x] **5. Full motion pipeline: multi-pose sequencing, history, and playback**
  Becomes usable: The complete core loop — a multi-pose prompt converges pose by pose, converged poses interpolate smoothly, the result saves as a numbered "Animation N" entry, Play loops it, and the model, joints, and animation history all persist across reload. Unlimited regeneration.
  Why now: Every risky piece (parsing, persistence, decomposition, single-pose convergence) is now proven in isolation; this slice composes them into the actual product and is the "oh, that's cool" moment.
  PRD ref: `prd.md > The Core Journey` (steps 6-11), `prd.md > Playback`, `prd.md > States and Boundaries` (Regeneration, Loading)
  Spec ref: `spec.md > Components > Motion Orchestration` (full multi-pose loop), `spec.md > Components > Animations History & Playback`, `spec.md > Data Model` (`animations` store), `spec.md > Important Failure Modes`
  Build: Loop the slice-4 convergence per decomposed pose; interpolate between converged poses (three.js `AnimationClip` or manual tweening); add `AnimationsHistoryPanel` (newest first, selectable) and `PlayButton`; add the `animations` IndexedDB store; handle failure modes — stop and show a plain error with no partial entry on an API failure, use the best-reached pose if a pose never converges within the cap.
  Verify (mechanical): Run a full multi-pose prompt end to end on a real model and confirm an "Animation 1" entry appears; press Play and confirm a continuous loop; reload the page and confirm the history entry persists; force an API failure (e.g. a temporarily invalid key) and confirm a clean error with no corrupted history entry.
  Learner check: Run the whole flow — upload, drag a joint, submit a 2-3 pose Motion prompt, watch it converge, press Play, reload the page, and confirm the animation is still there.
  Commit: `feat: compose full motion pipeline with multi-pose convergence, history, and playback`

- [ ] **6. Heron-inspired visual identity**
  Becomes usable: The dashboard reads as Atmosphere's actual visual identity — warm cream background, bold condensed caps type, one accent color, hairline borders with corner-bracket accents — instead of framework defaults, across every screen state.
  Why now: Deliberately last — visual identity gates no functional risk, and the PRD notes the learner wants to refine exact visual details only once the build is visible, not before.
  PRD ref: `prd.md > Look and Feel`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Look and Feel`
  Build: Add Tailwind theme tokens for the cream/near-black/accent palette; load Archivo Black and JetBrains Mono; add 1px hairline borders and CSS corner-bracket accents on panels/buttons; confirm the joint highlight stays a non-destructive indicator, never a material color override.
  Verify (mechanical): Visually inspect every screen state (empty/upload prompt, loaded model, Motion modal open, history populated) against the palette, type, and border rules above.
  Learner check: Look at the whole dashboard end to end and compare it against heronaiapp.com's feel; flag anything off.
  Commit: `feat: apply Heron-inspired visual identity to dashboard UI`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after Slice 2 (upload, orbit, manual joint drag, and reload persistence all working — enough real product to react to before the AI pipeline is built on top of it)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [what actually happened; real document/test/code references; unfinished work if interrupted]
Route and stops: [actual paths and symbols; guided stops completed, or reference-only route]
Edit outcome: [tried/kept/reverted/declined/not applicable; verification if changed]
Reflection: [offered/answered/declined/already covered — personal answer belongs only in the ignored profile]
Activity mode: [live app and editor, explicit static fallback, focused alternative, prior practice, or recap]

## Revisions

- Scaffolded on Next.js 16.4.3 instead of the spec's "Next.js 15" — `create-next-app@latest` installs whatever is current; no API used in this PoC depends on the difference, so the build continues on 16.x rather than pinning back.
- Removed the scaffold's `prefers-color-scheme: dark` CSS override — it silently flipped the background/foreground tokens to near-black/near-white whenever the OS was in dark mode, making all text invisible against the light panels. This app has one fixed Heron-inspired light identity, not an adaptive dark mode, so the override was deleted rather than patched.
- Pulled the Slice 6 Heron visual identity (palette, Archivo Black/Geist Mono typography, hairline borders, corner-bracket accents) forward into this checkpoint instead of waiting — the default scaffold styling was functionally broken (see above), not just unstyled, so it couldn't wait. Colors/fonts were measured directly from heronaiapp.com (accent `#fa3600`, hairline `#b3b3af`, body ink `#282828`, "BT Grotesk" stood in with Archivo Black). Slice 6 still does the final full-screen-state polish pass.
- Replaced the per-joint drag rotation entirely: the original version rotated bones around their own fixed local axes (then, after a first fix attempt, around the camera's fixed right/up axes), both of which a deterministic math check proved give the wrong rotation direction once the camera is orbited and/or the joint doesn't happen to face the camera. A follow-up hand-rolled arcball (virtual trackball) implementation fixed most cases (8/9 in a deterministic check) but the learner still hit a real mismatch on certain limbs in practice.
- Replaced the hand-rolled rotation entirely with three.js's own `TransformControls` (via `@react-three/drei`), in `rotate` + `local` mode, attached to whichever joint is selected (click a joint's dot to select it; its dot turns white, others stay orange, matching the reference app `philo-poser.web.app`'s selection pattern). This is the same mature, widely-used gizmo professional 3D tools (and very likely the reference app) use for exactly this interaction, so it can't carry the same class of directional bug a hand-rolled version can. Interaction model: grab one of the three colored rings (one per local axis) and drag along it — the joint rotates exactly around that axis. This is a different, more standard gesture than "drag anywhere" (matches Blender/Maya/the reference tool), not a single ambiguous free drag.
- Full UI redesign per learner request: removed the header/title entirely; the 3D viewport is now the full-screen background (with a 2D grid floor via drei's `Grid`), and the upload/filename controls live in a single floating panel, top-right, over the canvas. Camera now auto-fits to whatever model is uploaded (via drei's `Bounds`) instead of a fixed camera position, fixing a cropping issue on taller models. Palette/typography re-confirmed by scrolling the full heronaiapp.com reference page, not just its hero section.
- Slice 4 changes to the Jev call, found by running it against the real API: (1) one request asks a Noul plus two separate Choices (which joint, which direction) instead of the spec's single Choice over joint x direction combinations — ~34 + 6 options instead of ~200, and Jev's docs recommend multiple questions per call; (2) the step size is adaptive (starts at 30 degrees, halves per joint when Jev reverses its direction) instead of the spec's fixed ~15 degrees, because 15 degrees x 10 iterations couldn't cover the ~180 degrees an arm needs; (3) the match threshold is 0.7, not 0.8 — Jev scored a visually correct "right arm straight up" at 0.72; (4) Jev's measured cost is ~2,040 input tokens per step (~$0.0001), confirming the spec's cost estimate; (5) the model is cropped around its on-screen bounding box and the joint dots are hidden before each capture so Jev judges the figure, not the UI; (6) the Gemini decomposition prompt now forbids inventing poses the user didn't describe — it had added a "resting" pose to a single-pose prompt.
- Slice 5 changes found by running it: (1) saved animations store each keyframe's rotations as an array in bone-traversal order, not keyed by bone uuid as the spec's `jointAngles: { [jointId] }` implied — uuids are regenerated every time a file is parsed, so uuid-keyed history would silently stop working after a reload; (2) because each pose starts from where the previous one ended, the decomposition prompt now requires every pose description to be complete (both arms and legs stated explicitly) — otherwise "lower it and raise the left arm" collapsed into "left arm up" and left the right arm up; (3) playback loops rest -> each keyframe -> rest with eased interpolation, so a single-pose animation still reads as a loop; (4) uploading a different model clears the animation history, since the saved rotations belong to the old model's bones.
- Rewrote joint dragging a final time after the learner reported it still didn't feel fluid. Read the reference app's (philo-poser.web.app) shipped bundle to settle the question instead of guessing further, which showed three things our version got wrong: (1) it listens for `pointermove` on `window` rather than relying on R3F mesh events + `setPointerCapture` (which was dropping moves and making the drag feel choppy); (2) it projects the cursor onto a camera-facing `THREE.Plane` and uses `setFromUnitVectors`, i.e. absolute math per move rather than accumulating incremental deltas; (3) crucially, dragging a joint's dot rotates that joint's **parent** bone, so the dot you grabbed literally follows the cursor — our version rotated the grabbed bone itself, which left the dot pinned in place and was the real reason it never felt like it "obeyed". Verified by measurement: releasing at (890,440) left the dot at (880,433), and at a rotated camera, releasing at (640,530) left it at (637,540).
- Simplified joint manipulation per earlier learner feedback: the `TransformControls` 3-ring gizmo was more friction than the learner wanted ("solo uso el control general, no ejes independientes"). Removed it and the Lock concept entirely — joint dots are now always visible and always directly draggable (press-and-drag in one gesture, no select-then-grab-a-ring step), using the same arcball math proven out before. The dot highlights while held. Camera orbit is now always free (no Lock gate); only the dot you're actively pressing suspends orbit for that gesture, via a shared `isDraggingJoint` store flag, so posing and looking around never fight each other. Background switched from the dark "pro 3D editor" look back to the light Heron palette — the dark grid-floor reference image was only an example of the structural idea (full-bleed canvas + floor grid), not a literal color direction.
