---
doc: prd
status: approved
---

# Atmosphere — Product Requirements

A single-screen 3D dashboard where you upload an already-rigged 3D model, let Atmosphere map its joints, and describe a motion in plain language that an AI motion agent (Jev) turns into a smooth, looping animation by converging on each pose — proving that Atmosphere can condition any rig's real joints instead of generating anything new.
Source: `scope.md > The Core Loop`, `scope.md > The POC Boundary`.

## The Core Journey

1. User opens the app and lands directly on the dashboard — no prototype selector. It prompts them to upload a rigged 3D model.
2. User uploads a `.glb`/`.gltf` file. The app parses it, extracts its full joint/bone list, and renders the model standing in its default pose.
3. If the file has no skeleton or fails to parse, an error message appears and the user can retry with a different file.
4. Below the model, a **Lock** toggle (off by default): off rotates the whole model freely; on locks the whole-body pose and lets the user hover (highlighting a joint) and drag it to rotate just that joint. This lets the user confirm which joints actually exist and how they move.
5. A **Motion** button (disabled until a model with mapped joints is loaded) opens a modal with a text input. The user describes a sequence of poses (e.g. "raise the right arm, then crouch down, then stand back up").
6. On submit, for each described state, Atmosphere runs a convergence loop: render the model's current pose → ask Jev (Noul) whether it matches the described state → if not, ask Jev (Choice) which single joint adjustment gets closest, from the model's actual joint list → apply it → repeat, up to 10 iterations per state by default (adjustable). A loading/progress state is visible throughout.
7. The converged poses become keyframes; Atmosphere interpolates smoothly between them. The result saves as a numbered entry in an **Animations history** (most recent first).
8. User can regenerate motion as many times as they want; each run adds a new history entry. Selecting any past entry sets it as the active animation.
9. A **Play** button loops the active animation on the model; disabled until at least one animation exists.
10. The uploaded model, its joint map, and the animations history all persist across page reloads.
11. Success looks like: a rigged model goes in, a sentence goes in, and it performs the described motion, looping convincingly on screen — demonstrating the rig-conditioning kernel with zero manual keyframing.

## Screens and Layout

- **Single dashboard screen** (no prototype-selection screen, no separate reference/working model pair — this is a direct consequence of dropping the custom-built mannequin and reference-photo layering, scope: `Explicitly Cut`).
  - 3D viewport showing the uploaded model, centered.
  - Upload control (initial upload, and to replace the current model).
  - Lock toggle beneath the model.
  - Motion button (disabled until a model with joints is loaded).
  - Animations history panel: list of "Animation N" entries, selecting one sets it active.
  - Play button (disabled until an animation is selected/available).

## Look and Feel

Reference: [heronaiapp.com](https://heronaiapp.com/) — adapted as closely as possible for the platform UI; unaffected by this pivot.

- **Palette:** warm cream/off-white background, near-black text, one bold accent color (Heron's orange-red).
- **Typography:** bold, condensed, all-caps grotesk/sans for headlines; letter-spaced, small-caps/monospace-feeling labels for nav and UI chrome.
- **Borders and structure:** thin hairline borders on bordered elements (buttons, panels), small corner "bracket" accents (technical-drawing registration-mark style), thin hairline dividers between sections.
- **The 3D model itself:** no longer rendered in Atmosphere's own style — the uploaded model's materials/textures are shown as-is, since Atmosphere doesn't generate or own its appearance anymore. Only the surrounding UI (viewport frame, panels, buttons) carries the Heron identity.
- **Joint selection/highlight:** implemented as a non-destructive selection indicator (e.g. an outline or marker at the joint) rather than recoloring the model's own surface material, since that material belongs to the uploaded asset and shouldn't be overridden.
- The learner expects to refine exact visual details (precise hex values, font choice, spacing) once the build is visible; this direction is the starting point, not a locked spec (see `5-build`).

## Features and Behavior

### Model Upload & Joint Mapping
- As the learner, I want to upload a rigged 3D model and have its joints automatically recognized, so I can animate it without building or rigging anything myself.
  - [ ] Upload accepts `.glb`/`.gltf` files.
  - [ ] On success, the model renders in its default pose, and the app extracts its full joint/bone list (names and hierarchy).
  - [ ] On failure (invalid file, or no skeleton found), an error message appears; the user can retry immediately with a different file.
  - [ ] The uploaded model and its joint map persist across page reloads.

### Manual Joint Exploration (Lock)
- As the learner, I want to rotate the whole model or test individual joints by hand, so I can confirm what the model can actually do before animating it.
  - [ ] Lock off (default): dragging anywhere rotates the model as a whole.
  - [ ] Lock on: whole-model rotation is disabled; hovering a mapped joint shows a selection indicator, and dragging it rotates only that joint.

### Motion Generation (Jev Convergence)
- As the learner, I want to describe a sequence of poses in one prompt and get a smooth animation, so I can prove the rig can be conditioned by AI instead of hand-animated.
  - [ ] Motion button is disabled until a model with at least one mapped joint is loaded.
  - [ ] The modal accepts a prompt describing a sequence of states (not limited to two).
  - [ ] Jev's options for "which joint to adjust" are generated dynamically from the uploaded model's actual joint list — never a fixed, hardcoded list.
  - [ ] Convergence loop per described state: render current pose → Noul match-check → if unmatched, Choice adjustment → apply → repeat, capped at 10 iterations by default (the cap is adjustable, not fixed in stone).
  - [ ] A loading/progress state is visible while this runs; on completion, a new "Animation N" entry appears at the top of the Animations history.
  - [ ] Selecting any past "Animation N" entry sets it as the active animation.

### Playback
- As the learner, I want to watch the generated animation loop on the actual uploaded model, so I can see the finished result.
  - [ ] Play button is disabled when no animation is selected/available.
  - [ ] Pressing Play loops the active animation on the model continuously until stopped or replaced.

## States and Boundaries

- **First use** — dashboard prompts for a model upload; no model loaded, Motion and Play disabled.
- **Upload error** — invalid file or no skeleton detected: show an error message; user can retry immediately with a different file.
- **Loading** — visible indicator during the Jev convergence process (per state, since each state can take multiple iterations).
- **Regeneration** — motion can be regenerated an unlimited number of times; every run adds a new history entry rather than overwriting the previous one.
- **Dependency boundary** — Motion is unavailable without a loaded, mapped model; Play is unavailable without an existing animation.
- **Persistence** — the uploaded model, its joint map, and the Animations history all persist across page reloads (no server, no login — browser-side storage).
- **Degenerate rig** — a model that parses successfully but has zero or only one joint is treated the same as "no skeleton found" (upload error), since there's nothing meaningful to animate.

## Product Decisions

- **Dropped the custom-built mannequin and reference-photo layering agent, in favor of uploading an already-rigged 3D model** (sourced by the learner, e.g. via Mixamo's free library) and animating its real joints generically. Reason: generating convincing appearance/texture from a reference photo — without pasting a flat image that would look distorted, and without a full MCP/design-tool integration that was already out of scope — proved to be the hardest, least-resolved part of the project. An uploaded, already-rigged model sidesteps that problem entirely, delivers "atmosphere anything" more directly (any subject's rig works generically, not just a human one), and keeps the focus on the stronger, more defensible half of the idea: AI-driven movement.
- **Jev convergence mechanism** — carried forward unchanged: Jev only supports Choice/Score/Noul questions (confirmed against its docs), not raw continuous values, so motion is produced by an iterative loop (Noul to check pose match, Choice to pick the next single joint adjustment) rather than one call returning exact angles.
- **10 iterations per pose, adjustable** — a starting cap chosen to bound cost and latency; the learner may tune it once the build shows real convergence behavior.
- **No Layers history, no layer/animation combination** — both no longer apply; there is only an Animations history now.
- **Lock semantics** — unchanged from the earlier design: Lock ON freezes the model's overall pose for precise per-joint editing; Lock OFF frees whole-model rotation.
- **Joint highlight as a selection indicator, not material recoloring** — because the uploaded model's materials are user-provided and shouldn't be overridden by the app.

## What We're Building

- Single dashboard screen with model upload, 3D viewport, Lock toggle, Motion button, Animations history, and Play button.
- Upload flow for rigged `.glb`/`.gltf` models with automatic joint/bone mapping and an error state for invalid or unrigged files.
- Lock-based manual exploration: whole-model rotation vs. per-joint manipulation with hover highlight.
- Motion flow: multi-state prompt → Jev convergence loop (Noul + Choice, generated from the model's real joints, capped iterations) → smooth interpolation between converged poses.
- Animations history (numbered, unlimited regeneration, selectable) with Play-to-loop.
- Persistence of the uploaded model, its joint map, and the animations history across page reloads.
- Flat/minimalist, Heron-inspired responsive UI shell around the 3D viewport.

## Deferred From the POC

- Auto-rigging support for uploaded models that aren't already rigged.
- Re-texturing or applying custom materials/"layers" to an uploaded model — the original photo-driven appearance idea, reframed as a future styling feature on top of an existing rig.
- Support for 3D file formats beyond glTF/GLB.
- Multiple models/characters in one scene.
- Export pipeline beyond in-app playback.
- MCP integration with external design tools.
- Richer physics (muscle, cloth/hair).

## Possible Later Enhancements

- An explicit export/download button for the animated model.
- A built-in auto-rigger for unrigged uploads.
- Appearance/material editing as an optional layer on top of an uploaded rig.

## Non-Goals

- No custom-built mannequin geometry — the uploaded model is the subject (scope: `Explicitly Cut`).
- No AI-generated appearance/texture from a reference photo in this PoC (scope: `Explicitly Cut`).
- No editing of the uploaded model's own materials/textures (scope: `Explicitly Cut`).
- No multiple models/characters in one scene (scope: `Explicitly Cut`).
- No user accounts, login, or deployment (scope: `Explicitly Cut`).

## Open Questions

- Exact default iteration cap (10) and convergence threshold are starting points to tune once real convergence behavior is visible in `5-build` — not blocking for `4-spec`.
- Exact visual details of the flat/minimalist UI (specific colors, typography) remain for the learner to refine against the running build — not blocking.
