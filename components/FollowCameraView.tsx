"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { followViewRect } from "@/lib/followViewLayout";

/** How far back and up the follow camera sits from the figure, and where it aims. */
const DISTANCE = 4.5;
const EYE_HEIGHT = 1.3;
const LOOK_HEIGHT = 1.0;

const worldPos = new THREE.Vector3();

/**
 * A second, small view of the same scene, from a camera that tracks the stage
 * model's own world position every frame -- so a jump that lifts the figure in
 * the main view keeps it centred here too, front-on, for as long as playback
 * runs. Shown only while playing.
 *
 * Nothing about this is a second scene or a second model: a `THREE.Object3D`
 * has exactly one parent, so mounting the model's `<primitive>` a second time
 * (a second `<Canvas>`) would just move it out of the main view rather than
 * duplicate it. What it takes instead is a second camera and a second render
 * pass into a corner of the SAME canvas, using the SAME renderer and the SAME
 * scene -- the standard three.js technique for more than one viewport.
 *
 * That means taking over rendering: `useFrame` with a priority switches off
 * R3F's own automatic render for the whole canvas, because its render always
 * covers the full canvas and clears whatever was already drawn there. The main
 * view is rendered here too, first and full-size, so both still end up on
 * screen together every frame.
 */
export default function FollowCameraView() {
  const { gl, scene, camera, size } = useThree();
  const followCamera = useMemo(() => new THREE.PerspectiveCamera(45, 1, 0.1, 100), []);

  useFrame(() => {
    // The main view, exactly as R3F's own auto-render would have drawn it --
    // this has to happen here too, since taking a priority below disables that.
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);

    const { playing, scene: model } = useAtmosphereStore.getState();
    if (!playing || !model) return;

    model.getWorldPosition(worldPos);
    const follow = followCamera;
    follow.position.set(worldPos.x, worldPos.y + EYE_HEIGHT, worldPos.z + DISTANCE);
    follow.lookAt(worldPos.x, worldPos.y + LOOK_HEIGHT, worldPos.z);
    follow.updateProjectionMatrix();

    // setViewport/setScissor take CSS-pixel-scale values and multiply by the
    // renderer's own pixel ratio INTERNALLY (see three.js's WebGLRenderer) --
    // multiplying by it again here would double-apply it. That mistake is
    // invisible on a 1:1 display (ratio 1, so squaring it changes nothing),
    // which is exactly why this only showed up on a second monitor with a
    // different scale: the doubled ratio pushed the whole rect outside the
    // actual framebuffer, so nothing landed in frame and the mini-view read
    // as empty rather than merely misplaced.
    const rect = followViewRect();
    const x = rect.left;
    // WebGL's y is measured from the BOTTOM of the canvas; CSS measures from
    // the top, so the rect's top-based y has to be flipped.
    const y = size.height - rect.top - rect.size;
    const px = rect.size;

    gl.setScissorTest(true);
    gl.setScissor(x, y, px, px);
    gl.setViewport(x, y, px, px);
    gl.clear(true, true);
    gl.render(scene, follow);
    gl.setScissorTest(false);
  }, 1);

  return null;
}
