"use client";

import { useEffect } from "react";
import { CHAIN_RANGE, COLLISION_RANGE, LIMIT_RANGE } from "@/lib/motionSettings";
import { setLimitStrength } from "@/lib/jointLimits";
import { setChainStrength } from "@/lib/ikChain";
import { setCollisionStrength } from "@/lib/collision";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/** CSS variable the .range track uses to paint its filled portion. */
const fill = (value: number, range: { min: number; max: number }) =>
  ({ "--fill": `${((value - range.min) / (range.max - range.min)) * 100}%` }) as React.CSSProperties;

interface PercentSliderProps {
  label: string;
  hint: string;
  value: number;
  range: { min: number; max: number };
  onChange: (value: number) => void;
}

function PercentSlider({ label, hint, value, range, onChange }: PercentSliderProps) {
  const percent = Math.round(value * 100);
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-3">
        {label} · {percent}%
        <input
          type="range"
          min={range.min * 100}
          max={range.max * 100}
          step={5}
          value={percent}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="range w-28"
          style={fill(percent, { min: range.min * 100, max: range.max * 100 })}
        />
      </span>
      <span className="normal-case tracking-normal text-foreground/60">{hint}</span>
    </label>
  );
}

/**
 * The three dials that decide how physical the body is, wherever a pose is
 * written -- a hand-dragged joint exactly as much as a generated one.
 *
 * Always mounted, so the module state these set (`jointLimits`, `ikChain`,
 * `collision`) stays correct whether or not the panel is open, the same way
 * `MotionSection` used to apply `limitStrength` on its own.
 */
export default function PhysicsSection() {
  const settings = useAtmosphereStore((s) => s.settings);
  const setSettings = useAtmosphereStore((s) => s.setSettings);
  const openPanel = useAtmosphereStore((s) => s.openPanel);
  const setOpenPanel = useAtmosphereStore((s) => s.setOpenPanel);
  const open = openPanel === "physics";

  useEffect(() => setLimitStrength(settings.limitStrength), [settings.limitStrength]);
  useEffect(() => setChainStrength(settings.chainStrength), [settings.chainStrength]);
  useEffect(() => setCollisionStrength(settings.collisionStrength), [settings.collisionStrength]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpenPanel(open ? null : "physics")}
        aria-expanded={open}
        data-active={open}
        className="btn flex items-center justify-between px-4 py-2 font-mono text-xs uppercase tracking-widest"
      >
        <span>Physics</span>
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 font-mono text-xs uppercase tracking-widest">
          <PercentSlider
            label="Joint limits"
            hint="How strictly elbows, knees and the rest keep to a human range. 0 lets them bend any way; 100 is a hinge that cannot hyperextend or fold sideways."
            value={settings.limitStrength}
            range={LIMIT_RANGE}
            onChange={(limitStrength) => setSettings({ ...settings, limitStrength })}
          />
          <PercentSlider
            label="Chain reaction"
            hint="Dragging a joint by hand: how far the pull travels up the body. 0 moves only the joint you grab; 100 reaches the shoulder and chest, the way a real pull does. No effect on a generated pose."
            value={settings.chainStrength}
            range={CHAIN_RANGE}
            onChange={(chainStrength) => setSettings({ ...settings, chainStrength })}
          />
          <PercentSlider
            label="Collisions"
            hint="Whether overlapping limbs are pushed apart. 0 lets an arm sink into the torso; 100 is fully rigid, a body that can never pass through itself."
            value={settings.collisionStrength}
            range={COLLISION_RANGE}
            onChange={(collisionStrength) => setSettings({ ...settings, collisionStrength })}
          />
        </div>
      )}
    </div>
  );
}
