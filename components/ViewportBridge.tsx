"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";
import { loadMannequin, poseMannequin } from "@/lib/mannequin";
import { applySegmentsToRig, type PoseSegments } from "@/lib/poseRetarget";
import { collectBones } from "@/lib/boneMath";
import { resetToRest } from "@/lib/pose";

const CAPTURE_SIZE = 512;
const FIT_PADDING = 1.1;

/** World-space positions of every (skinned) vertex of the model, as x,y,z triples. */
function modelVertices(model: THREE.Object3D) {
  const out: number[] = [];
  const v = new THREE.Vector3();
  model.updateWorldMatrix(true, true);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const count = mesh.geometry.getAttribute("position")?.count ?? 0;
    for (let i = 0; i < count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

/** The three screen axes a capture is taken along: right, up, and back toward the camera. */
function frameBasis(camera: THREE.PerspectiveCamera, yaw: number) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);

  // Swing the view around the world's vertical, so a judge can be shown the
  // body from an angle that reveals what a head-on shot flattens away.
  if (yaw !== 0) {
    const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(yaw)
    );
    right.applyQuaternion(turn);
    up.applyQuaternion(turn);
    back.applyQuaternion(turn);
  }
  return { right, up, back };
}

type Basis = ReturnType<typeof frameBasis>;

/** How far the model reaches along each of those axes, in world units. */
interface Extents {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

function extentsOf(model: THREE.Object3D, { right, up, back }: Basis): Extents {
  const verts = modelVertices(model);
  if (verts.length === 0) throw new Error("The model has no visible geometry to capture.");
  const e: Extents = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  };
  const p = new THREE.Vector3();
  for (let i = 0; i < verts.length; i += 3) {
    p.set(verts[i], verts[i + 1], verts[i + 2]);
    const x = p.dot(right), y = p.dot(up), z = p.dot(back);
    e.minX = Math.min(e.minX, x); e.maxX = Math.max(e.maxX, x);
    e.minY = Math.min(e.minY, y); e.maxY = Math.max(e.maxY, y);
    e.minZ = Math.min(e.minZ, z); e.maxZ = Math.max(e.maxZ, z);
  }
  return e;
}

const widen = (a: Extents, b: Extents): Extents => ({
  minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
  minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
  minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ),
});

/**
 * A camera looking the same way as `camera` (so "left"/"up"/"toward viewer" mean
 * the same thing) but moved to centre and fit what `extents` covers.
 *
 * Distance is worked out from the corners of that box rather than from the
 * vertices, which overshoots a little and so frames slightly wide. That is the
 * right trade for a frame shared by several poses: it is the one case where the
 * vertices of every pose are not all in hand at once, and framing wide only
 * costs a few pixels where framing tight would clip a limb.
 */
function cameraFor(camera: THREE.PerspectiveCamera, basis: Basis, e: Extents) {
  const { right, up, back } = basis;
  const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;

  // Rendered square, so the vertical field of view is the limit on both axes.
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  // Every corner must satisfy |offset| <= tan * (distance - z) in camera space.
  let distance = 0;
  for (const x of [e.minX, e.maxX]) {
    for (const y of [e.minY, e.maxY]) {
      for (const z of [e.minZ, e.maxZ]) {
        const spread = Math.max(Math.abs(x - cx), Math.abs(y - cy)) * FIT_PADDING;
        distance = Math.max(distance, spread / tan + z);
      }
    }
  }

  const fit = camera.clone();
  fit.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
  fit.position
    .set(0, 0, 0)
    .addScaledVector(right, cx)
    .addScaledVector(up, cy)
    .addScaledVector(back, distance);
  fit.aspect = 1;
  fit.near = 0.01;
  fit.far = distance - e.minZ + (e.maxZ - e.minZ) + 1;
  fit.updateProjectionMatrix();
  fit.updateMatrixWorld(true);
  return fit;
}

/** Name given to the joint-handle groups, so a capture can hide them without waiting for React. */
export const HANDLES_NAME = "joint-handles";

export default function ViewportBridge() {
  const { camera, gl, scene: threeScene } = useThree();
  const setViewport = useAtmosphereStore((s) => s.setViewport);

  useEffect(() => {
    // Captures render offscreen, so the picture on screen never flickers and no
    // frames need to pass between one candidate and the next.
    const target = new THREE.WebGLRenderTarget(CAPTURE_SIZE, CAPTURE_SIZE, {
      colorSpace: THREE.SRGBColorSpace,
      samples: 4,
    });
    const pixels = new Uint8Array(CAPTURE_SIZE * CAPTURE_SIZE * 4);
    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_SIZE;
    canvas.height = CAPTURE_SIZE;

    /**
     * Frames held still across a run of captures, by side and angle.
     *
     * A capture normally re-centres on the figure, which is right when the
     * question is what pose it is in. It is wrong when the question is how it
     * moves: re-centring every frame subtracts exactly the rise and fall that
     * carries the weight, and a strip of frames taken that way shows a figure
     * pedalling in a fixed box. A locked frame is widened to hold every pose it
     * is shown, and then every shot is taken from the same place.
     */
    const locked = new Map<string, { basis: Basis; extents: Extents }>();

    function sceneFor(side: Side) {
      const store = useAtmosphereStore.getState();
      const scene = side === "initial" ? store.scene : store.finalScene;
      if (!scene) throw new Error("No model loaded.");
      if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error("Unsupported camera.");
      return { scene, other: side === "initial" ? store.finalScene : store.scene, camera };
    }

    /** Widens the frame for this side and angle to also hold the pose on screen now. */
    function lockFrame(side: Side, yaw = 0) {
      const { scene, camera: cam } = sceneFor(side);
      const key = `${side}:${yaw}`;
      const held = locked.get(key);
      const basis = held?.basis ?? frameBasis(cam, yaw);
      const extents = extentsOf(scene, basis);
      locked.set(key, { basis, extents: held ? widen(held.extents, extents) : extents });
    }

    async function capture(side: Side = "initial", yaw = 0) {
      const { scene, other } = sceneFor(side);

      // Only the model being judged goes in the picture: no other model, no handles.
      const hidden: THREE.Object3D[] = [];
      if (other?.visible) hidden.push(other);
      threeScene.traverse((o) => {
        if (o.name === HANDLES_NAME && o.visible) hidden.push(o);
      });
      hidden.forEach((o) => (o.visible = false));

      const previousTarget = gl.getRenderTarget();
      try {
        gl.setRenderTarget(target);
        const held = locked.get(`${side}:${yaw}`);
        const basis = held?.basis ?? frameBasis(camera as THREE.PerspectiveCamera, yaw);
        const extents = held?.extents ?? extentsOf(scene, basis);
        gl.render(threeScene, cameraFor(camera as THREE.PerspectiveCamera, basis, extents));
        return readTarget();
      } finally {
        gl.setRenderTarget(previousTarget);
        hidden.forEach((o) => (o.visible = true));
      }
    }

    /** Reads the offscreen target back as an upright JPEG data URL. */
    function readTarget() {
      gl.readRenderTargetPixels(target, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE, pixels);
      const image = new ImageData(CAPTURE_SIZE, CAPTURE_SIZE);
      const row = CAPTURE_SIZE * 4;
      for (let y = 0; y < CAPTURE_SIZE; y++) {
        image.data.set(
          pixels.subarray((CAPTURE_SIZE - 1 - y) * row, (CAPTURE_SIZE - y) * row),
          y * row
        );
      }
      canvas.getContext("2d")!.putImageData(image, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.85);
    }

    /**
     * Photographs `segments` on the stand-in body rather than on the uploaded
     * model, in a scene of its own that nothing on screen can see.
     *
     * Falls back to the uploaded model when no mannequin has been built, so a
     * checkout without `public/mannequin.glb` still generates.
     */
    async function captureProxy(segments: PoseSegments, yaw = 0, side: Side = "initial") {
      const mannequin = await loadMannequin();
      if (!mannequin) {
        const bones = collectBones(sceneFor(side).scene);
        resetToRest(bones);
        applySegmentsToRig(bones, segments, camera);
        return capture(side, yaw);
      }

      poseMannequin(mannequin, segments, camera);
      const basis = frameBasis(camera as THREE.PerspectiveCamera, yaw);
      const extents = extentsOf(mannequin.model, basis);

      const previousTarget = gl.getRenderTarget();
      try {
        gl.setRenderTarget(target);
        gl.render(mannequin.scene, cameraFor(camera as THREE.PerspectiveCamera, basis, extents));
        return readTarget();
      } finally {
        gl.setRenderTarget(previousTarget);
      }
    }

    setViewport({
      camera,
      capture,
      captureProxy,
      lockFrame,
      clearFrames: () => locked.clear(),
    });
    return () => {
      setViewport(null);
      target.dispose();
    };
  }, [camera, gl, threeScene, setViewport]);

  return null;
}
