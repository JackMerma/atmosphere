"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
import { settlePose } from "@/lib/settle";
import { applySlot } from "@/lib/pose";
import { DEFAULT_MOTION } from "@/lib/motionParams";
import { GROUND_AT_REST, placeGround } from "@/lib/planting";
import { timelineFor, type Timeline } from "@/lib/timeline";
import type { Animation } from "@/lib/animations";

/** Older animations: seconds per segment of rest -> keyframes -> rest. */
const LEGACY_SECONDS_PER_SEGMENT = 1.2;

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * While playing, drives the stage model (the initial-state one) through the
 * active animation, honouring each keyframe's time and easing and the dials the
 * animation was tuned to, then loops. Stopping puts the model back in its
 * initial pose. Renders nothing.
 */
export default function PlaybackDriver() {
  const clock = useRef(0);
  const wasPlaying = useRef(false);
  const bound = useRef<{ animation: Animation; bones: THREE.Bone[]; timeline: Timeline } | null>(
    null
  );

  useFrame((_, delta) => {
    const { playing, scene, animations, activeAnimationId } = useAtmosphereStore.getState();

    if (!playing || !scene) {
      clock.current = 0;
      if (wasPlaying.current) {
        wasPlaying.current = false;
        applySlot("initial");
        placeGround(GROUND_AT_REST);
      }
      return;
    }
    const animation = animations.find((a) => a.id === activeAnimationId);
    if (!animation) return;

    const bones = collectBones(scene);
    wasPlaying.current = true;

    if (animation.duration !== undefined) {
      if (animation.keyframes.some((k) => k.quats.length !== bones.length)) return;

      // Rebuilt only when the model or the animation changes: it caches the
      // bone groupings, which cost a walk up every chain to work out.
      if (bound.current?.animation !== animation || bound.current.bones !== bones) {
        bound.current = {
          animation,
          bones,
          timeline: timelineFor(animation, scene, bones, animation.motion ?? DEFAULT_MOTION),
        };
      }
      // The clock is NOT wrapped: the timeline repeats on its own, and the
      // travel has to carry on across repeats rather than snap back at the seam.
      clock.current += delta;
      bound.current.timeline.pose(clock.current);
      return;
    }

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
    settlePose(bones, 1);
  });

  return null;
}
