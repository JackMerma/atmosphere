"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
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
      const { from, to, w } = sampleTimeline(animation, clock.current);
      bones.forEach((bone, i) => {
        qa.fromArray(from[i]);
        qb.fromArray(to[i]);
        bone.quaternion.slerpQuaternions(qa, qb, w);
      });
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
  });

  return null;
}
