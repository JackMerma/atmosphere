"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useAtmosphereStore, type Side } from "@/store/useAtmosphereStore";

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

/**
 * A camera looking the same way as `camera` (so "left"/"up"/"toward viewer" mean
 * the same thing) but moved to centre the model on screen and fit all of it,
 * whatever pose it is in or where the user orbited. Fits the actual vertices,
 * not the axis-aligned box, whose corners overshoot when viewed at an angle.
 */
function fittingCamera(camera: THREE.PerspectiveCamera, model: THREE.Object3D) {
  const verts = modelVertices(model);
  if (verts.length === 0) throw new Error("The model has no visible geometry to capture.");

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);

  // Screen-plane extents of the model, to centre it.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < verts.length; i += 3) {
    p.set(verts[i], verts[i + 1], verts[i + 2]);
    const x = p.dot(right), y = p.dot(up), z = p.dot(back);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  // Rendered square, so the vertical field of view is the limit on both axes.
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  // Every vertex must satisfy |offset| <= tan * (distance - z) in camera space.
  let distance = 0;
  for (let i = 0; i < verts.length; i += 3) {
    p.set(verts[i], verts[i + 1], verts[i + 2]);
    const spread = Math.max(Math.abs(p.dot(right) - cx), Math.abs(p.dot(up) - cy)) * FIT_PADDING;
    distance = Math.max(distance, spread / tan + p.dot(back));
  }

  const fit = camera.clone();
  fit.position
    .set(0, 0, 0)
    .addScaledVector(right, cx)
    .addScaledVector(up, cy)
    .addScaledVector(back, distance);
  fit.aspect = 1;
  fit.near = 0.01;
  fit.far = distance - minZ + (maxZ - minZ) + 1;
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

    async function capture(side: Side = "initial") {
      const store = useAtmosphereStore.getState();
      const scene = side === "initial" ? store.scene : store.finalScene;
      const other = side === "initial" ? store.finalScene : store.scene;
      if (!scene) throw new Error("No model loaded.");
      if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error("Unsupported camera.");

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
        gl.render(threeScene, fittingCamera(camera, scene));
        gl.readRenderTargetPixels(target, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE, pixels);
      } finally {
        gl.setRenderTarget(previousTarget);
        hidden.forEach((o) => (o.visible = true));
      }

      // Pixels come back bottom-up; flip them into an upright image.
      const image = new ImageData(CAPTURE_SIZE, CAPTURE_SIZE);
      const row = CAPTURE_SIZE * 4;
      for (let y = 0; y < CAPTURE_SIZE; y++) {
        image.data.set(pixels.subarray((CAPTURE_SIZE - 1 - y) * row, (CAPTURE_SIZE - y) * row), y * row);
      }
      canvas.getContext("2d")!.putImageData(image, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.85);
    }

    setViewport({ camera, capture });
    return () => {
      setViewport(null);
      target.dispose();
    };
  }, [camera, gl, threeScene, setViewport]);

  return null;
}
