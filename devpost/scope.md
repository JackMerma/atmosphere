---
doc: scope
status: approved
---

# Atmosphere

**Atmosphere anything.** An AI tool that brings an already-rigged 3D model to life: upload a rigged humanoid model, describe a motion in plain language, and the app assembles an animation out of real motion-captured poses — chosen and judged by AI — instead of keyframing or inventing a pose from scratch.

## The Unique Kernel
An LLM plans a titled, ordered sequence of poses from the prompt — each with per-limb target directions, an importance weight per limb, and a natural-language description. Each planned pose is matched against a library of 200+ real poses harvested from Mixamo animations, filtered down to the closest ranked candidates using the LLM's own weights. The shortlisted candidates are posed on a stand-in mannequin (never the user's own model) and photographed from four angles — front, back, left, right — and Jev judges the photos and picks the winner for each planned pose. The winning real poses assemble into the animation and play on the user's own uploaded model, under real anatomical joint limits and self-collision.

Real motion, chosen by AI judgment, driving a real model's real joints — not an AI inventing a pose from nothing.

The "atmosphere anything" lema is the sales pitch — the ambition the learner wants Atmosphere to carry. This version's actual, demoed scope is narrower: humanoid rigged models only. The pose library and the anatomical limits assume a humanoid rig.

## Who It's For
Designers, hackathon shippers, and indie devs (the learner is the first user) who already have — or can grab for free, e.g. from Mixamo's rigged character library — a rigged humanoid 3D model, and want to animate it by describing what should happen instead of hand-keying every joint in a 3D tool they don't know.

## The Core Loop
Upload a rigged humanoid 3D model (`.glb`) → the app reads its skeleton and maps every joint → drag any joint directly to confirm the rig responds (always available, just to verify what exists, not to animate) → open the config panel and set Physics (joint-limit strength, chain-reaction/IK strength, self-collision strength) and Motion (ranked poses, options per query, batches) → write a motion prompt → an LLM plans a titled (max two words), ordered list of poses for it → each planned pose is matched against the 200+-pose Mixamo library, filtered to the closest ranked candidates by the LLM's own weights → the candidates are posed on a stand-in mannequin, photographed from four angles, and judged by Jev, which picks the winner per pose → the winning poses assemble into the titled animation, saved to history → press Play: the animation loops on your own model, with a follow-camera "spy" view tracking its movement as it plays.

## Inspiration & Identity
- Higgsfield's "Layers" feature — an animated falling figure that sparked the whole idea.
- The broader trend: ambient, animated "atmospheres" showing up in more and more web hero sections and product sites — Atmosphere wants to make that intelligent and generalizable instead of bespoke per project.
- [heronaiapp.com](https://heronaiapp.com/) — platform UI identity: warm cream background, bold condensed uppercase type, one accent color, hairline borders with technical corner-bracket accents, fine hatched line-art illustration. Full detail in `prd.md > Look and Feel`.
- The uploaded model's own appearance (materials, textures, style) is whatever the model itself carries — Atmosphere doesn't impose a visual style on the subject, only on the surrounding UI. The stand-in mannequin Jev judges poses on is never shown to the user — it exists only so every judgment happens on a neutral, comparable body.

## Why This Matters to the Learner
Self-described as someone who cares more about a product's presentation, mood, and "sellability" than its backend — this project is a direct expression of that, and "atmosphere anything" is the ambition they want it to carry. Built partly to learn Jev hands-on as the judgment layer of a multi-stage AI pipeline (LLM planning, a real motion-capture library, Jev judging), partly as a hackathon entry, and partly as a reusable personal tool: a fast, cheap way to animate 3D assets for future hackathons and projects.

## What "Working" Looks Like
Screen by screen: open the app → upload a rigged humanoid `.glb` → the model appears, standing in its default pose, with its joints mapped and directly draggable → drag a joint to confirm the rig actually responds → open the config panel, set Physics and Motion settings → write a prompt like "jump" or "walk" → watch the AI title and plan the pose sequence, match it against the real Mixamo pose library, and have Jev judge the candidates on a stand-in mannequin → the result saves to the animation history under its own AI-given title → press Play, watch it loop with a follow-camera spy view tracking the model as it moves. The "oh, that's cool" beat: real motion-captured poses, intelligently selected and judged by AI, driving your own uploaded model's real joints under real physical limits — zero manual keyframing, zero invented-from-scratch poses.

## The POC Boundary
- Single dashboard screen — no prototype-type selector, no separate reference/working model pair.
- Upload of a rigged humanoid 3D model, `.glb` only — the model must already have a skeleton.
- Automatic parsing and mapping of the uploaded model's existing skeleton/joints.
- Direct manual joint manipulation — every joint is always visible and draggable — so the user can confirm which joints exist and see the rig respond. Verification, not animation.
- Config panel: Physics (joint-limit strength, chain-reaction/IK strength, self-collision strength) and Motion (ranked-poses count, options per query, batch count), feeding the generation pipeline below.
- Motion agent: prompt → an LLM plans a titled (max two words), ordered list of poses — each with per-limb target directions, an importance weight per limb, and a natural-language description — → each planned pose is matched against a library of 200+ real poses from Mixamo animations, filtered to the closest ranked candidates using the LLM's weights → each candidate is posed on a stand-in mannequin (never the uploaded model) and photographed from four angles (front, back, left, right) → Jev judges the photos and picks the winner per pose → the winning real poses assemble into the animation, applied to the user's own model under real anatomical joint limits and self-collision.
- Animations history: AI-titled entries, unlimited regeneration, independently selectable, persisted across page reloads.
- Play button: loops the currently selected animation, with a follow-camera spy view tracking the model's live position during playback.
- Humanoid rigs only.
- No login, no deployment.

## Later
- Generalizing beyond humanoid rigs to any subject (animal, object) — the "atmosphere anything" vision.
- Auto-rigging support for uploaded models that aren't already rigged.
- Support for 3D file formats beyond `.glb`.
- Growing the Mixamo pose library for more precision (today's known weak spot: thin coverage for some motions, e.g. no dedicated walking clip).
- Re-texturing or applying custom materials/"layers" to an uploaded model — a styling feature on top of an existing rig.
- Multiple models/characters in one scene.
- Export pipeline beyond in-app playback.
- MCP integration with external design tools.
- Richer physics (muscle, cloth/hair) beyond today's joint-limit, collision, and chain-reaction layer.
- A "pin initial/final state" two-model reference mode and a live debug filmstrip of judged candidates — both exist, neither is part of this version's demoed story.

## Explicitly Cut
- Building Atmosphere's own mannequin geometry as the user-facing subject — the uploaded model is the subject. (A stand-in mannequin still exists, but only internally, so Jev always judges a neutral, comparable body — it's never shown to the user.)
- AI-generated appearance/texture from a reference photo.
- Editing or retexturing the uploaded model's own materials.
- Multiple models in one scene.
- User accounts, login, or deployment.
