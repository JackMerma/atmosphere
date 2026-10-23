"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

const CAPTURE_SIZE = 512;
const CROP_PADDING = 1.25;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Screen-space rect (in canvas pixels) around the model, padded and squared. */
function modelCropRect(scene: THREE.Object3D, camera: THREE.Camera, width: number, height: number) {
  const box = new THREE.Box3().setFromObject(scene);
  const corners = [0, 1].flatMap((x) =>
    [0, 1].flatMap((y) =>
      [0, 1].map((z) =>
        new THREE.Vector3(
          x ? box.max.x : box.min.x,
          y ? box.max.y : box.min.y,
          z ? box.max.z : box.min.z
        ).project(camera)
      )
    )
  );
  const xs = corners.map((c) => ((c.x + 1) / 2) * width);
  const ys = corners.map((c) => ((1 - c.y) / 2) * height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const side = Math.min(Math.max(maxX - minX, maxY - minY) * CROP_PADDING, Math.min(width, height));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = Math.min(Math.max(cx - side / 2, 0), width - side);
  const y = Math.min(Math.max(cy - side / 2, 0), height - side);
  return { x, y, side };
}

export default function ViewportBridge() {
  const { camera, gl } = useThree();
  const setViewport = useAtmosphereStore((s) => s.setViewport);

  useEffect(() => {
    async function capture() {
      const store = useAtmosphereStore.getState();
      const scene = store.scene;
      if (!scene) throw new Error("No model loaded.");

      store.setCapturing(true);
      await nextFrame();
      await nextFrame();

      const source = gl.domElement;
      const { x, y, side } = modelCropRect(scene, camera, source.width, source.height);
      const out = document.createElement("canvas");
      out.width = CAPTURE_SIZE;
      out.height = CAPTURE_SIZE;
      out.getContext("2d")!.drawImage(source, x, y, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);

      useAtmosphereStore.getState().setCapturing(false);
      return out.toDataURL("image/jpeg", 0.85);
    }

    setViewport({ camera, capture });
    return () => setViewport(null);
  }, [camera, gl, setViewport]);

  return null;
}
