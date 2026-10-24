"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Grid } from "@react-three/drei";
import { registerGround } from "@/lib/planting";

/**
 * The floor the figure stands on, and walks over.
 *
 * It sits in a group of its own because a walk's travel is put into the ground
 * rather than into the figure: the grid is uniform and endless, so sliding it is
 * indistinguishable from the figure crossing it, and the figure stays in frame
 * however long the animation loops.
 */
export default function Ground() {
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    registerGround(group.current);
    return () => registerGround(null);
  }, []);

  return (
    <group ref={group}>
      <Grid
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#d9d3c3"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#b3b3af"
        fadeDistance={28}
        fadeStrength={1.2}
        infiniteGrid
        raycast={() => null}
      />
    </group>
  );
}
