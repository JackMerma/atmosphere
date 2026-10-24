"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { collectBones } from "@/lib/boneMath";
import { constrainPose } from "@/lib/jointLimits";

const SECONDS_PER_SEGMENT = 1.2;

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * While playing, loops the active animation: initial state (rest pose if none) -> each
 * keyframe in order -> back to the start, easing between neighbours. Renders nothing; it only
 * drives bone rotations each frame.
 */
export default function PlaybackDriver() {
  const clock = useRef(0);

  useFrame((_, delta) => {
    const { playing, scene, animations, activeAnimationId } = useAtmosphereStore.getState();
    if (!playing || !scene) {
      clock.current = 0;
      return;
    }
    const animation = animations.find((a) => a.id === activeAnimationId);
    if (!animation) return;

    const bones = collectBones(scene);
    const rest = bones.map((b) => b.userData.restQuaternion as number[]);
    const base = animation.start ?? rest;
    const frames = [base, ...animation.keyframes.map((k) => k.quats), base];
    if (frames.some((f) => f.length !== bones.length)) return;

    const segments = frames.length - 1;
    clock.current = (clock.current + delta / SECONDS_PER_SEGMENT) % segments;
    const from = Math.floor(clock.current);
    const t = smoothstep(clock.current - from);

    bones.forEach((bone, i) => {
      qa.fromArray(frames[from][i]);
      qb.fromArray(frames[from + 1][i]);
      bone.quaternion.slerpQuaternions(qa, qb, t);
    });
    // Easing between two legal poses can still pass outside the limits.
    constrainPose(bones);
  });

  return null;
}
