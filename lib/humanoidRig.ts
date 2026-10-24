import * as THREE from "three";

export type Side = "l" | "r";

export interface Limb {
  bone: THREE.Bone;
  /** The bone this one points at (elbow for upper arm, wrist for forearm, ...). */
  child: THREE.Bone | null;
}

export interface HumanoidRig {
  hips: THREE.Bone;
  thigh: Record<Side, Limb>;
  calf: Partial<Record<Side, Limb>>;
  foot: Partial<Record<Side, Limb>>;
  upperArm: Record<Side, Limb>;
  foreArm: Partial<Record<Side, Limb>>;
  /** Neck bone pointing at the head: its direction is the head's tilt. */
  neck?: Limb;
}

export type Part = "thigh" | "calf" | "foot" | "upperArm" | "foreArm" | "neck";

/** Strips side markers ("Left", "_L", ".R") and returns them separately. */
function parseName(raw: string): { side: Side | null; core: string } {
  let name = raw.replace(/^mixamorig[:_]?/i, "").toLowerCase();
  let side: Side | null = null;
  if (/left/.test(name)) side = "l";
  else if (/right/.test(name)) side = "r";
  name = name.replace(/left|right/g, "");
  if (!side) {
    const m = name.match(/(?:^|[^a-z])([lr])(?=[^a-z]|$)/);
    if (m) side = m[1] as Side;
  }
  return { side, core: name.replace(/(^|[^a-z])[lr](?=[^a-z]|$)/g, "$1").replace(/[^a-z]/g, "") };
}

function classify(core: string): Part | null {
  if (/toe|hand|finger|thumb|index|middle|ring|pinky/.test(core)) return null;
  if (/^(upleg|upperleg|thigh|femur)/.test(core)) return "thigh";
  if (/^(leg|lowerleg|calf|shin|knee)/.test(core)) return "calf";
  if (/foot|ankle/.test(core)) return "foot";
  if (/forearm|lowerarm|elbow/.test(core)) return "foreArm";
  if (/^(arm|upperarm)/.test(core)) return "upperArm";
  return null;
}

/** Which limb segment a bone is, judged by its name; null for anything else. */
export function classifyBone(name: string): Part | null {
  const { core } = parseName(name);
  return core === "neck" ? "neck" : classify(core);
}

const firstBoneChild = (bone: THREE.Bone) =>
  bone.children.find((c): c is THREE.Bone => c instanceof THREE.Bone) ?? null;

/**
 * Recognises a humanoid skeleton from bone names (Mixamo, Unreal-style and
 * Blender-style "_L"/".L" conventions). Throws if the limbs needed to orient
 * the body can't be found.
 */
export function mapHumanoid(bones: THREE.Bone[]): HumanoidRig {
  const found: Partial<Record<Part, Partial<Record<Side, THREE.Bone>>>> = {};
  let neck: THREE.Bone | undefined;
  let head: THREE.Bone | undefined;
  for (const bone of bones) {
    const { side, core } = parseName(bone.name);
    if (!side) {
      if (core === "neck") neck ??= bone;
      else if (core === "head") head ??= bone;
    }
    const part = classify(core);
    if (!side || !part) continue;
    (found[part] ??= {})[side] ??= bone;
  }

  const chain = (part: Part, next: Part | null, side: Side) => {
    const bone = found[part]?.[side];
    if (!bone) return undefined;
    const child = next ? (found[next]?.[side] ?? null) : firstBoneChild(bone);
    return { bone, child };
  };

  const thighL = chain("thigh", "calf", "l");
  const thighR = chain("thigh", "calf", "r");
  const armL = chain("upperArm", "foreArm", "l");
  const armR = chain("upperArm", "foreArm", "r");
  if (!thighL || !thighR || !armL || !armR) {
    throw new Error(
      "Couldn't recognise a humanoid skeleton (need left/right arms and legs named like Mixamo)."
    );
  }
  const hips = thighL.bone.parent;
  if (!(hips instanceof THREE.Bone)) {
    throw new Error("Couldn't find the hips bone above the legs.");
  }

  return {
    hips,
    thigh: { l: thighL, r: thighR },
    calf: { l: chain("calf", "foot", "l"), r: chain("calf", "foot", "r") },
    foot: { l: chain("foot", null, "l"), r: chain("foot", null, "r") },
    upperArm: { l: armL, r: armR },
    foreArm: { l: chain("foreArm", null, "l"), r: chain("foreArm", null, "r") },
    neck: neck && head ? { bone: neck, child: head } : undefined,
  };
}
