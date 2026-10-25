---
doc: prd
status: approved
---

# Atmosphere — Product Requirements

A single-screen 3D dashboard where you upload an already-rigged humanoid 3D model and describe a motion in plain language; an AI pipeline plans a sequence of poses, matches each one against a library of real motion-captured poses, and has Jev judge the best match — producing a looping animation built from real human motion, not an invented one, applied to your own model's real joints.
Source: `scope.md > The Core Loop`, `scope.md > The POC Boundary`.

## The Core Journey

1. User opens the app and lands directly on the dashboard — no prototype selector. It prompts them to upload a rigged 3D model.
2. User uploads a `.glb` file. The app parses it, extracts its full joint/bone list, and renders the model standing in its default pose.
3. If the file has no skeleton, isn't a humanoid rig, or fails to parse, an error message appears and the user can retry with a different file.
4. Every joint is visible on the model as a draggable handle. The user can drag any joint directly to see the rig respond — a way to confirm what the model can actually do, not a step toward the final animation.
5. A configuration panel offers two sections: **Physics** (joint-limit strength, chain-reaction strength, self-collision strength) and **Motion** (ranked poses, options per query, batches, and the motion prompt field).
6. User writes a prompt describing a motion (e.g. "jump" or "raise the right arm, then crouch down") and submits it.
7. Atmosphere plans and generates the motion: an AI planner titles the animation (two words or fewer) and writes an ordered list of poses for the prompt, each with a target direction and an importance weight per limb, plus a plain-language description. Each planned pose is compared against a library of 200+ real poses harvested from motion-capture animations, filtered down to the closest candidates using the planner's own weights. Those candidates are tried on a stand-in body — never the user's own model — and photographed from four angles; Jev judges the photos and picks the best match for each pose. A visible loading state covers the whole process; the viewport stays responsive to orbiting while it runs.
8. The winning poses assemble into the animation and apply to the user's own model, respecting its real joint limits and resolving any self-collision. The result saves as a new, AI-titled entry at the top of the **Animations history**.
9. User can regenerate as many times as they want; each run adds a new history entry without touching previous ones. Selecting any past entry sets it as the active animation.
10. A **Play** button loops the active animation on the model; disabled until at least one animation exists. While it plays, a small tracking camera view appears, following the model so its movement stays in frame even if the user's own view doesn't.
11. The uploaded model, its joint map, and the animations history all persist across page reloads.
12. Success looks like: a rigged humanoid model goes in, a short prompt goes in, and real motion — assembled from real poses, chosen and judged by AI — plays back on that model's own joints, looping convincingly on screen, with zero manual keyframing and zero invented-from-scratch poses.

## Screens and Layout

- **Single dashboard screen** (no prototype-selection screen, no separate reference/working model pair).
  - Full-bleed 3D viewport: the uploaded model, centered, camera framing adjusted automatically to fit it.
  - A floating control panel, top-right, over the viewport: upload control, the Physics/Motion configuration (an exclusive accordion — opening one closes the other), the Animations history list, and the Play button.
  - Joint handles are drawn directly on the model at all times, not tucked behind a mode switch.
  - During playback only, a small picture-in-picture tracking camera view appears beside the control panel.

## Look and Feel

Reference: [heronaiapp.com](https://heronaiapp.com/) — the platform UI identity.

- **Palette:** warm cream/off-white background, near-black text, one bold accent color (Heron's orange-red).
- **Typography:** bold, condensed, all-caps grotesk/sans for headlines; letter-spaced, small-caps/monospace-feeling labels for nav and UI chrome.
- **Borders and structure:** thin hairline borders on bordered elements (buttons, panels), small corner "bracket" accents (technical-drawing registration-mark style), thin hairline dividers between sections.
- **The 3D model itself:** rendered as uploaded — its own materials and textures are shown as-is, since Atmosphere doesn't generate or own its appearance. Only the surrounding UI (viewport frame, panels, buttons) carries the Heron identity.
- **Joint handles:** small, always-visible, non-destructive indicators on the model (not a recoloring of the model's own surface); the one currently being dragged highlights to confirm the grab registered.
- The learner expects to refine exact visual details (precise hex values, font choice, spacing) against the running build — this direction is the starting point, not a locked spec.

## Features and Behavior

### Model Upload & Joint Mapping
- As the learner, I want to upload a rigged humanoid model and have its joints automatically recognized, so I can animate it without building or rigging anything myself.
  - [ ] Upload accepts `.glb` files.
  - [ ] On success, the model renders in its default pose, and the app extracts its full joint/bone list and recognizes it as a humanoid rig.
  - [ ] On failure (invalid file, no skeleton found, or a rig that isn't recognized as humanoid), an error message appears; the user can retry immediately with a different file.
  - [ ] The uploaded model and its joint map persist across page reloads.

### Direct Joint Manipulation
- As the learner, I want to grab and move any joint by hand, so I can confirm what the model can actually do before animating it.
  - [ ] Every mapped joint is visible on the model as a handle, with no mode switch to turn this on.
  - [ ] Pressing and dragging a handle rotates that joint directly and smoothly, following the cursor.
  - [ ] This manual pose does not persist across a reload — a fresh load always shows the model at rest.

### Physics Configuration
- As the learner, I want the generated motion to respect believable body limits, so poses look like a body moving rather than joints floating independently.
  - [ ] A **Physics** section exposes three strength dials: joint limits (how strictly a joint's rotation is kept anatomically plausible), chain reaction (how much a moved joint pulls on the joints above it), and self-collision (how strongly overlapping limbs are pushed apart).
  - [ ] Every pose the app produces — planned, judged, or hand-dragged — is run through these same rules before it's shown.

### Motion Generation (Plan, Match, Judge)
- As the learner, I want to describe a motion in plain language and get back a real, believable animation, so I can prove AI can direct existing motion-capture data intelligently instead of inventing poses from nothing.
  - [ ] A **Motion** section holds the prompt field and three settings: ranked poses (how many library candidates survive the first filter), options per query (how many of those Jev compares at once), and batches (how many rounds of comparison run).
  - [ ] Submitting a prompt is disabled until a humanoid model with mapped joints is loaded.
  - [ ] The animation is titled automatically (two words or fewer) from the prompt.
  - [ ] The plan is an ordered list of poses, each compared against the real pose library and judged on a neutral stand-in body — never the user's uploaded model — before a winner is chosen.
  - [ ] A loading state is visible for the whole process; the viewport can still be orbited while it runs.
  - [ ] On completion, a new, titled entry appears at the top of the Animations history.

### Animations History & Playback
- As the learner, I want to keep and replay every animation I generate, so I can compare attempts and show the best one.
  - [ ] Every generation adds a new entry to the history rather than replacing the last one; regeneration is unlimited.
  - [ ] Selecting any past entry sets it as the active animation.
  - [ ] Play is disabled when no animation is selected or available; pressing it loops the active animation continuously until stopped or replaced.
  - [ ] While playing, a tracking camera view follows the model so its movement stays visible even if it would otherwise leave the user's own view.

## States and Boundaries

- **First use** — dashboard prompts for a model upload; no model loaded, Motion and Play unavailable.
- **Upload error** — an invalid file, a file with no skeleton, or a rig that isn't recognized as humanoid: show an error message; the user can retry immediately with a different file.
- **Generating** — a visible loading state covers planning, matching, and judging; the viewport stays responsive to orbiting throughout.
- **Regeneration** — motion can be regenerated an unlimited number of times; every run adds a new history entry rather than overwriting the previous one.
- **Dependency boundary** — Motion is unavailable without a loaded, mapped humanoid model; Play is unavailable without an existing animation.
- **Persistence** — the uploaded model, its joint map, and the Animations history all persist across page reloads (no server, no login). A manually dragged pose does not persist; reloading always returns the model to rest.
- **Non-humanoid rig** — a rig the app can't recognize as humanoid is treated as an upload error; direct joint dragging would still work on it, but Physics and Motion do not apply.

## Product Decisions

- **The motion pipeline plans, matches, and judges, rather than inventing poses joint-by-joint** — an AI planner writes the intended sequence of poses up front; each is matched against a library of real, pre-harvested motion-capture poses; Jev's role is to judge which real candidate fits best, not to move raw joints by trial and error. This is the core bet of the project: real motion, intelligently selected, beats motion invented from scratch.
- **Scope is humanoid rigs only, `.glb` only, for this version** — the pose library, the physics layer, and the planner are all built around a humanoid skeleton; "Atmosphere anything" remains the ambition for the product, not a claim about this build.
- **Direct joint dragging has no mode switch** — it exists purely so the user can confirm what the model can actually do; it is not part of the generated animation and doesn't need to be gated behind a toggle.
- **Jev never judges the user's own model** — a neutral stand-in body is posed and photographed instead, so every judgment happens on a consistent, comparable figure regardless of what the user uploaded.
- **A tracking camera appears during playback** — a user's own free-orbit view can lose a large motion (like a jump) off-frame; a second, automatic view keeps the figure visible regardless of where the user's camera is pointed.
- **A reference "pin two states" mode and a live debug view of what Jev is shown both exist, and neither is part of what this version presents** — they're useful for building and verifying the pipeline, not for proving the product to a reviewer in a short demo.

## What We're Building

- Single dashboard screen with model upload, a full-bleed 3D viewport, always-visible draggable joint handles, a Physics/Motion configuration panel, Animations history, and Play.
- Upload flow for rigged humanoid `.glb` models with automatic joint mapping and an error state for invalid, unrigged, or non-humanoid files.
- Direct manual joint manipulation for verification, with no persistence of the dragged pose across reloads.
- A configurable physics layer (joint limits, chain reaction, self-collision) applied to every pose the app produces.
- Motion flow: a prompt → an AI-planned, titled sequence of poses → each pose matched against a real pose library and judged by Jev on a neutral stand-in body → the winning poses assembled into the animation and applied to the user's model.
- Animations history (AI-titled, unlimited regeneration, selectable) with Play-to-loop and a tracking camera during playback.
- Persistence of the uploaded model, its joint map, and the animations history across page reloads.
- A flat, Heron-inspired responsive UI shell around the 3D viewport.

## Deferred From the POC

- Support for non-humanoid rigs (animal, object) — the "atmosphere anything" vision this version doesn't yet implement.
- Auto-rigging support for uploaded models that aren't already rigged.
- Support for 3D file formats beyond `.glb`.
- Growing the pose library for more precision in motions it currently covers thinly.
- Re-texturing or applying custom materials/"layers" to an uploaded model.
- Multiple models/characters in one scene.
- Export pipeline beyond in-app playback.
- MCP integration with external design tools.
- Richer physics (muscle, cloth/hair) beyond today's joint-limit, collision, and chain-reaction layer.
- Exposing the "pin two states" reference mode or the live debug view of judged candidates to end users.

## Possible Later Enhancements

- An explicit export/download button for the animated model.
- A built-in auto-rigger for unrigged uploads.
- Letting a viewer opt into seeing the debug view of candidates Jev judged, as a "show your work" feature rather than a hidden dev tool.

## Non-Goals

- No custom-built mannequin geometry as the user-facing subject — the uploaded model is the subject (scope: `Explicitly Cut`).
- No AI-generated appearance/texture from a reference photo in this PoC (scope: `Explicitly Cut`).
- No editing of the uploaded model's own materials/textures (scope: `Explicitly Cut`).
- No multiple models/characters in one scene (scope: `Explicitly Cut`).
- No user accounts, login, or deployment (scope: `Explicitly Cut`).
- No support for non-humanoid rigs or formats beyond `.glb` in this version (scope: `The POC Boundary`).

## Known Limitations

Found during a hands-on review of the working build, accepted as-is for this version rather than fixed:

- The Physics and Motion dials aren't self-explanatory — a first-time user wouldn't know how to tune them well without already understanding what each one does.
- Simple, single actions (jump, sit, walk) produce convincing animations; a more elaborate, multi-beat prompt is more likely to return a pose sequence that doesn't read as coherent motion.
- The UI isn't responsive outside laptop-sized viewports, and working directly with some 3D models' joints showed limits not yet fully characterized.

See `docs/status.md > What is weak, and known` for the fuller technical picture.

## Open Questions

- Exact default values for the Physics and Motion dials remain tunable against real generations — not blocking.
- Whether the debug view or the "pin two states" mode ever become user-facing features is open for later, not part of this POC.
