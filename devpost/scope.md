---
doc: scope
status: approved
---

# Atmosphere

**Atmosphere anything.** An AI tool that brings an already-rigged 3D model to life: upload it, describe a motion in plain language, and AI figures out how to move its existing joints, pose by pose — no keyframing, no animation software.

## The Unique Kernel
Every rigged 3D model already carries its own "controlled environment" — a skeleton someone else already built. Atmosphere doesn't need to build or dress anything; it just has to read whatever joints a model actually has and decide how to move them to match a described pose — iteratively, by showing the AI (Jev) the current pose and asking what to adjust next, the same way you'd nudge a puppet closer to a shape. That mechanism doesn't care whether the skeleton belongs to a person, an animal, or an object, so "atmosphere anything" is really just "upload a rigged model" — not a roadmap promise, a direct consequence of how the kernel works.

## Who It's For
Designers, hackathon shippers, and indie devs (the learner is the first user) who already have — or can grab for free, e.g. from Mixamo's rigged character library — a rigged 3D model, and want to animate it by describing what should happen instead of hand-keying every joint in a 3D tool they don't know.

## The Core Loop
Upload a pre-rigged 3D model (glTF/GLB) → the app reads its skeleton and maps every joint it can move → explore those joints by hand (Lock toggle: off rotates the whole model to inspect it, on lets you drag individual joints, highlighted on hover) → write a motion prompt describing a sequence of poses → Jev converges on each pose iteratively — sees the current pose, decides the next single adjustment, repeats up to a capped number of times — → the result saves into an animation history, replayable and regenerable → press Play to watch it loop.

## Inspiration & Identity
- Higgsfield's "Layers" feature — an animated falling figure that sparked the whole idea.
- The broader trend: ambient, animated "atmospheres" showing up in more and more web hero sections and product sites — Atmosphere wants to make that intelligent and generalizable instead of bespoke per project.
- [heronaiapp.com](https://heronaiapp.com/) — platform UI identity: warm cream background, bold condensed uppercase type, one accent color, hairline borders with technical corner-bracket accents, fine hatched line-art illustration. Full detail in `prd.md > Look and Feel`.
- The uploaded model's own appearance (materials, textures, style) is whatever the model itself carries — Atmosphere no longer renders its own geometry, so it doesn't impose a visual style on the subject, only on the surrounding UI.

## Why This Matters to the Learner
Self-described as someone who cares more about a product's presentation, mood, and "sellability" than its backend — this project is a direct expression of that, and "atmosphere anything" is the ambition they want it to carry. Built partly to learn Jev hands-on (the project's technical center of gravity after this pivot), partly as a hackathon entry, and partly as a reusable personal tool: a fast, cheap way to animate 3D assets for future hackathons and projects.

## What "Working" Looks Like
Screen by screen: open the app → the dashboard asks to upload a rigged 3D model → upload a `.glb` file → the model appears, standing in its default pose, with its joints mapped → drag a few joints with Lock on, rotate the whole model with Lock off, to confirm it responds → write a prompt like "raise the right arm, then crouch down" → watch Jev converge on each pose, iteration by iteration → the result saves to the animation history → press Play, watch it loop. The "oh, that's cool" beat is watching an inert, downloaded 3D model come alive and perform a described motion with zero manual keyframing — pure language-to-motion.

## The POC Boundary
- Single dashboard screen — no prototype-type selector, no separate reference/working model pair.
- Upload of a pre-rigged 3D model file (glTF/GLB) — the model must already have a skeleton; Atmosphere does not rig unrigged models in this version.
- Automatic parsing and mapping of the uploaded model's existing skeleton/joints.
- Manual exploration: Lock toggle — off rotates the whole model; on highlights a mapped joint on hover and lets you drag it individually.
- Motion agent: a prompt describing a sequence of poses → Jev convergence loop per state (Noul to check match against a rendered view of the current pose, Choice to pick the next single joint adjustment from the model's actual joint list) → capped at 10 iterations per pose by default (adjustable) → smooth interpolation between the converged poses.
- Animations history: numbered entries, unlimited regeneration, independently selectable, persisted across page reloads.
- Play button: loops the currently selected animation.
- Works generically for any uploaded subject — human, animal, object — no special-casing by type.
- No login, no deployment.

## Later
- Auto-rigging support for uploaded models that aren't already rigged (e.g. a Mixamo-style auto-rigger integrated into the app).
- Re-texturing or applying custom materials/"layers" to an uploaded model — the original photo-driven appearance idea, reframed as a styling feature on top of an existing rig rather than the whole kernel.
- Support for 3D file formats beyond glTF/GLB.
- Multiple models/characters in one scene.
- Export pipeline beyond in-app playback.
- MCP integration with external design tools.
- Richer physics (muscle, cloth/hair).

## Explicitly Cut
- Building Atmosphere's own mannequin geometry — superseded; the uploaded model is the subject now.
- AI-generated appearance/texture from a reference photo — proved to be the hardest, least-resolved part of the original plan; cut from this PoC, may return later as an optional styling layer on top of an uploaded rig.
- Editing or retexturing the uploaded model's own materials.
- Multiple models in one scene.
- User accounts, login, or deployment.
