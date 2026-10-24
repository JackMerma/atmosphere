import * as THREE from "three";
import { ease } from "@/lib/easing";
import { mapHumanoid } from "@/lib/humanoidRig";
import { anchorFor } from "@/lib/anchor";
import { groundModel } from "@/lib/grounding";
import { settlePose } from "@/lib/settle";
import { DEFAULT_MOTION, type MotionParams } from "@/lib/motionParams";
import type { Animation } from "@/lib/animations";

/**
 * What it takes to play a motion: the poses, how long it lasts and whether it
 * repeats. Less than a saved animation, so a generation can be played and
 * judged before there is anything to save.
 */
export type Motion = Pick<Animation, "keyframes" | "duration" | "loop">;

/** A one-off animation rests on its final pose, then blends back to the start to repeat. */
const HOLD_AT_END = 0.4;
const RETURN_TIME = 0.6;
/** A cycle has no rest: it returns in about the length of one of its own segments. */
const MIN_CYCLE_RETURN = 0.12;
/** The most any joint may trail, whatever the lag dial says. */
const MAX_LAG = 0.13;

/** How long an animation rests on its last pose, and how long it takes to return. */
export function tail(animation: Motion) {
  const total = animation.duration ?? 0;
  if (!animation.loop) return { hold: HOLD_AT_END, back: RETURN_TIME };
  const segments = Math.max(1, animation.keyframes.length - 1);
  return { hold: 0, back: Math.max(MIN_CYCLE_RETURN, total / segments) };
}

/** Seconds from the start of the animation to the start of its next repeat. */
export function cycleLength(animation: Motion) {
  const { hold, back } = tail(animation);
  return (animation.duration ?? 0) + hold + back;
}

/** Whether the figure has its weight on the floor at this point in the animation. */
export function groundedAt(animation: Motion, time: number) {
  const frames = animation.keyframes;
  if (!frames.some((k) => k.grounded !== undefined)) return false;
  let i = 0;
  while (i < frames.length - 1 && time >= (frames[i + 1].time ?? 0)) i++;
  // Only while both ends of the segment are planted, so a jump leaves the floor.
  return frames[i].grounded === true && (frames[i + 1]?.grounded ?? frames[i].grounded) === true;
}

/**
 * The pose of a timeline animation at `time`, as [from, to, progress].
 *
 * `spacing` is a power on the eased progress: under 1 the body arrives early
 * and waits on the pose, over 1 it holds and then goes. It is what lets a judge
 * be shown the same poses with the time between them spent differently.
 */
export function sampleTimeline(animation: Motion, time: number, spacing = 1) {
  const frames = animation.keyframes;
  const total = animation.duration ?? 0;
  const last = frames[frames.length - 1];
  const { hold, back } = tail(animation);
  const space = (w: number) => (spacing === 1 ? w : Math.pow(Math.min(1, Math.max(0, w)), spacing));

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
  return { from: frames[i].quats, to: frames[i + 1].quats, w: space(ease(frames[i + 1].ease, u)) };
}

/** Every bone from the shoulders out, which the arm dials act on alone. */
function armBones(bones: THREE.Bone[]): Set<THREE.Bone> {
  const arms = new Set<THREE.Bone>();
  let rig;
  try {
    rig = mapHumanoid(bones);
  } catch {
    return arms;
  }
  for (const side of ["l", "r"] as const) {
    rig.upperArm[side].bone.traverse((o) => {
      if (o instanceof THREE.Bone) arms.add(o);
    });
  }
  return arms;
}

/**
 * Bones grouped by how far back in the timeline each one reads, in seconds.
 *
 * Real limbs do not all arrive at once: the shoulder turns, the elbow follows,
 * the hand gets there last, so each joint is sampled slightly behind the one
 * above it. That drag is what separates a whip from a signpost swinging round.
 * The arms can be offset further still, which slides them around the cycle
 * relative to the legs -- the difference between arms opposite the legs and
 * arms moving with them.
 */
function timingGroups(bones: THREE.Bone[], params: MotionParams, cycle: number) {
  const anchor = anchorFor(bones);
  const arms = params.armPhase === 0 ? null : armBones(bones);
  const groups = new Map<number, THREE.Bone[]>();
  for (const bone of bones) {
    let depth = 0;
    for (let p: THREE.Object3D | null = bone.parent; p; p = p.parent) {
      if (!(p instanceof THREE.Bone)) break;
      depth++;
      if (p === anchor) break;
    }
    let offset = Math.min(depth * params.lag, MAX_LAG);
    if (arms?.has(bone)) offset += params.armPhase * cycle;
    const rounded = Math.round(offset * 1000) / 1000;
    const group = groups.get(rounded);
    if (group) group.push(bone);
    else groups.set(rounded, [bone]);
  }
  return [...groups.entries()];
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qr = new THREE.Quaternion();

export interface Timeline {
  /** Seconds from the start of the animation to the start of its next repeat. */
  cycle: number;
  /**
   * Puts the model in the pose the animation holds at `time`: samples the
   * keyframes, scales how far each pose commits, settles the result into a body
   * that can exist, and stands it on the floor where the pose is grounded.
   */
  pose(time: number): void;
}

/**
 * Binds an animation to a model and a set of dials, ready to be sampled.
 *
 * One function serves playback and the offscreen captures a judge is shown, so
 * what Jev is asked about is the same motion the user will see rather than a
 * second implementation of it that has drifted.
 */
export function timelineFor(
  animation: Motion,
  model: THREE.Object3D,
  bones: THREE.Bone[],
  params: MotionParams = DEFAULT_MOTION
): Timeline {
  const cycle = cycleLength(animation);
  const groups = timingGroups(bones, params, cycle);
  const arms = params.armAmplitude === 1 ? null : armBones(bones);
  const rest = bones.map((b) => b.userData.restQuaternion as number[] | undefined);

  return {
    cycle,
    pose(time: number) {
      // Each group reads the timeline a little further back than the last.
      for (const [offset, group] of groups) {
        const at = ((time - offset) % cycle + cycle) % cycle;
        const { from, to, w } = sampleTimeline(animation, at, params.spacing);
        for (const bone of group) {
          const i = bones.indexOf(bone);
          qa.fromArray(from[i]);
          qb.fromArray(to[i]);
          bone.quaternion.slerpQuaternions(qa, qb, w);

          // How far the pose commits, measured from where the body rests. Over
          // 1 carries the limb past the authored pose along the same arc, which
          // is how an arm that the planner left hanging gets a real swing.
          const scale = params.amplitude * (arms?.has(bone) ? params.armAmplitude : 1);
          const resting = rest[i];
          if (scale !== 1 && resting) {
            // The sampled pose has to be read out before the bone is overwritten
            // with rest, or the slerp runs from rest to rest and nothing moves.
            qb.copy(bone.quaternion);
            qr.fromArray(resting);
            bone.quaternion.copy(qr).slerp(qb, scale);
          }
        }
      }
      // Easing between two settled poses can still pass through the body; one
      // pass per frame keeps playback clear without stalling the frame.
      settlePose(bones, 1);

      // Standing the figure on its lowest foot is what gives a walk its weight:
      // the legs bend, the body drops, and the hips rise again as they extend.
      if (params.bob !== 0 && groundedAt(animation, time)) groundModel(model, bones, params.bob);
    },
  };
}
