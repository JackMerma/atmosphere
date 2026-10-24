"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
import { groundModel } from "@/lib/grounding";
import { anchorFor } from "@/lib/anchor";
import { settlePose } from "@/lib/settle";
import { ease } from "@/lib/easing";
import { applySlot } from "@/lib/pose";
import type { Animation } from "@/lib/animations";

/** Older animations: seconds per segment of rest -> keyframes -> rest. */
const LEGACY_SECONDS_PER_SEGMENT = 1.2;
/** A one-off animation rests on its final pose, then blends back to the start to repeat. */
const HOLD_AT_END = 0.4;
const RETURN_TIME = 0.6;
/** A cycle has no rest: it returns in about the length of one of its own segments. */
const MIN_CYCLE_RETURN = 0.12;
/** Seconds each joint trails the one above it, and the most any joint may trail. */
const LAG_PER_JOINT = 0.03;
const MAX_LAG = 0.13;

/**
 * Bones grouped by how far they trail the body, in seconds.
 *
 * Real limbs do not all arrive at once: the shoulder turns, the elbow follows,
 * the hand gets there last. Sampling each joint slightly behind the one above
 * it gives that drag for free, and is what separates a whip from a signpost
 * swinging round.
 */
function lagGroups(bones: THREE.Bone[], anchor: THREE.Bone | null) {
  const groups = new Map<number, THREE.Bone[]>();
  for (const bone of bones) {
    let depth = 0;
    for (let p: THREE.Object3D | null = bone.parent; p; p = p.parent) {
      if (!(p instanceof THREE.Bone)) break;
      depth++;
      if (p === anchor) break;
    }
    const lag = Math.min(depth * LAG_PER_JOINT, MAX_LAG);
    const rounded = Math.round(lag * 1000) / 1000;
    const group = groups.get(rounded);
    if (group) group.push(bone);
    else groups.set(rounded, [bone]);
  }
  return [...groups.entries()];
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** How long an animation rests on its last pose, and how long it takes to return. */
function tail(animation: Animation) {
  const total = animation.duration ?? 0;
  if (!animation.loop) return { hold: HOLD_AT_END, back: RETURN_TIME };
  const segments = Math.max(1, animation.keyframes.length - 1);
  return { hold: 0, back: Math.max(MIN_CYCLE_RETURN, total / segments) };
}

/** Whether the figure has its weight on the floor at this point in the animation. */
function grounded(animation: Animation, time: number) {
  const frames = animation.keyframes;
  if (!frames.some((k) => k.grounded !== undefined)) return false;
  let i = 0;
  while (i < frames.length - 1 && time >= (frames[i + 1].time ?? 0)) i++;
  // Only while both ends of the segment are planted, so a jump leaves the floor.
  return frames[i].grounded === true && (frames[i + 1]?.grounded ?? frames[i].grounded) === true;
}

/** The pose of a timeline animation at `time`, as [from, to, progress]. */
function sampleTimeline(animation: Animation, time: number) {
  const frames = animation.keyframes;
  const total = animation.duration ?? 0;
  const last = frames[frames.length - 1];
  const { hold, back } = tail(animation);

  if (time >= total + hold) {
    const u = Math.min(1, (time - total - hold) / back);
    // A cycle flows on through; a one-off eases back to where it began.
    return { from: last.quats, to: frames[0].quats, w: animation.loop ? u : ease("inOut", u) };
  }
  if (time >= total) return { from: last.quats, to: last.quats, w: 0 };

  let i = 0;
  while (i < frames.length - 2 && time >= (frames[i + 1].time ?? 0)) i++;
  const t0 = frames[i].time ?? 0;
  const t1 = frames[i + 1].time ?? t0;
  const u = t1 > t0 ? (time - t0) / (t1 - t0) : 1;
  return { from: frames[i].quats, to: frames[i + 1].quats, w: ease(frames[i + 1].ease, u) };
}

/**
 * While playing, drives the stage model (the initial-state one) through the
 * active animation, honouring each keyframe's time and easing, then loops.
 * Stopping puts the model back in its initial pose. Renders nothing.
 */
export default function PlaybackDriver() {
  const clock = useRef(0);
  const wasPlaying = useRef(false);
  const lagCache = useRef<{ bones: THREE.Bone[]; groups: [number, THREE.Bone[]][] } | null>(null);

  useFrame((_, delta) => {
    const { playing, scene, animations, activeAnimationId } = useAtmosphereStore.getState();

    if (!playing || !scene) {
      clock.current = 0;
      if (wasPlaying.current) {
        wasPlaying.current = false;
        applySlot("initial");
      }
      return;
    }
    const animation = animations.find((a) => a.id === activeAnimationId);
    if (!animation) return;

    const bones = collectBones(scene);
    wasPlaying.current = true;

    if (animation.duration !== undefined) {
      if (animation.keyframes.some((k) => k.quats.length !== bones.length)) return;
      const { hold, back } = tail(animation);
      const cycle = animation.duration + hold + back;
      clock.current = (clock.current + delta) % cycle;

      if (lagCache.current?.bones !== bones) {
        lagCache.current = { bones, groups: lagGroups(bones, anchorFor(bones)) };
      }
      // Each group reads the timeline a little further back than the last.
      for (const [lag, group] of lagCache.current.groups) {
        const at = (clock.current - lag + cycle) % cycle;
        const { from, to, w } = sampleTimeline(animation, at);
        for (const bone of group) {
          const i = bones.indexOf(bone);
          qa.fromArray(from[i]);
          qb.fromArray(to[i]);
          bone.quaternion.slerpQuaternions(qa, qb, w);
        }
      }
    } else {
      const rest = bones.map((b) => b.userData.restQuaternion as number[]);
      const base = animation.start ?? rest;
      const frames = [base, ...animation.keyframes.map((k) => k.quats), base];
      if (frames.some((f) => f.length !== bones.length)) return;

      const segments = frames.length - 1;
      clock.current = (clock.current + delta / LEGACY_SECONDS_PER_SEGMENT) % segments;
      const from = Math.floor(clock.current);
      const t = smoothstep(clock.current - from);
      bones.forEach((bone, i) => {
        qa.fromArray(frames[from][i]);
        qb.fromArray(frames[from + 1][i]);
        bone.quaternion.slerpQuaternions(qa, qb, t);
      });
    }
    // Easing between two settled poses can still pass through the body; one
    // pass per frame keeps playback clear without stalling the frame.
    settlePose(bones, 1);

    // Standing the figure on its lowest foot is what gives a walk its weight:
    // the legs bend, the body drops, and the hips rise again as they extend.
    if (grounded(animation, clock.current)) groundModel(scene, bones);
  });

  return null;
}
