"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const CAPTURE_SIZE = 512;
const FIT_PADDING = 1.1;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

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

  // The square crop is limited by the narrower field of view.
  const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
  const tan = Math.min(Math.tan(halfV), Math.tan(halfV) * camera.aspect);

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
  fit.near = 0.01;
  fit.far = distance - minZ + (maxZ - minZ) + 1;
  fit.updateProjectionMatrix();
  fit.updateMatrixWorld(true);
  return fit;
}

export default function ViewportBridge() {
  const { camera, gl, scene: threeScene } = useThree();
  const setViewport = useAtmosphereStore((s) => s.setViewport);

  useEffect(() => {
    async function capture() {
      const store = useAtmosphereStore.getState();
      const scene = store.scene;
      if (!scene) throw new Error("No model loaded.");

      store.setCapturing(true);
      await nextFrame();
      await nextFrame();

      try {
        if (!(camera instanceof THREE.PerspectiveCamera)) throw new Error("Unsupported camera.");
        const source = gl.domElement;
        // Render the model fully framed, then crop the centred square it fits in.
        gl.render(threeScene, fittingCamera(camera, scene));
        const side = Math.min(source.width, source.height);
        const out = document.createElement("canvas");
        out.width = CAPTURE_SIZE;
        out.height = CAPTURE_SIZE;
        out
          .getContext("2d")!
          .drawImage(
            source,
            (source.width - side) / 2,
            (source.height - side) / 2,
            side,
            side,
            0,
            0,
            CAPTURE_SIZE,
            CAPTURE_SIZE
          );
        return out.toDataURL("image/jpeg", 0.85);
      } finally {
        useAtmosphereStore.getState().setCapturing(false);
      }
    }

    setViewport({ camera, capture });
    return () => setViewport(null);
  }, [camera, gl, threeScene, setViewport]);

  return null;
}
