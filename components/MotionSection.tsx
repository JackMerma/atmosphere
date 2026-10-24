"use client";

import { useState } from "react";
import { generateAnimation, type Progress } from "@/lib/animator";
import { createAnimation } from "@/lib/animations";
import {
  CANDIDATES_RANGE,
  DEFAULT_SETTINGS,
  ITERATIONS_RANGE,
  STEP_RANGE,
  type MotionSettings,
} from "@/lib/refine";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

/** CSS variable the .range track uses to paint its filled portion. */
const fill = (value: number, range: { min: number; max: number }) =>
  ({ "--fill": `${((value - range.min) / (range.max - range.min)) * 100}%` }) as React.CSSProperties;

interface SliderProps {
  label: string;
  suffix?: string;
  value: number;
  range: { min: number; max: number };
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function Slider({ label, suffix = "", value, range, step = 1, disabled, onChange }: SliderProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        {label} · {value}
        {suffix}
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range w-28"
        style={fill(value, range)}
      />
    </label>
  );
}

/**
 * Collapsible Motion controls inside the main panel. Generating builds an
 * animation from the initial state to the final state; the prompt is optional
 * and, when given, lets Gemini direct the timing and the beats in between.
 */
export default function MotionSection() {
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);
  const setGenerating = useAtmosphereStore((s) => s.setGenerating);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<MotionSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setGenerating(true);
    setError(null);
    setSaved(null);
    setProgress(null);
    try {
      const result = await generateAnimation(prompt, settings, setProgress);
      const animation = await createAnimation(result.keyframes, result.duration);
      setSaved(
        `${animation.label} · ${result.duration.toFixed(1)}s · ${result.beats} directed beat${
          result.beats === 1 ? "" : "s"
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the animation.");
    } finally {
      setBusy(false);
      setGenerating(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={!hasJoints}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-active={open}
        className="btn flex items-center justify-between px-4 py-2 font-mono text-xs uppercase tracking-widest"
      >
        <span>Motion</span>
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            disabled={busy}
            placeholder="Optional. Direct the motion between the two states: speed, impacts, what the body does on the way (e.g. falls fast, flails, gets caught mid-air and hangs suspended)."
            className="resize-none border border-hairline bg-transparent p-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 font-mono text-xs uppercase tracking-widest">
            <Slider
              label="Rounds"
              value={settings.iterations}
              range={ITERATIONS_RANGE}
              disabled={busy}
              onChange={(iterations) => setSettings({ ...settings, iterations })}
            />
            <Slider
              label="Candidates"
              value={settings.candidates}
              range={CANDIDATES_RANGE}
              disabled={busy}
              onChange={(candidates) => setSettings({ ...settings, candidates })}
            />
            <Slider
              label="Step"
              suffix="°"
              value={settings.stepDegrees}
              range={STEP_RANGE}
              step={5}
              disabled={busy}
              onChange={(stepDegrees) => setSettings({ ...settings, stepDegrees })}
            />
          </div>

          {progress && (
            <div className="flex flex-col gap-1 font-mono text-xs uppercase tracking-widest text-foreground/70">
              <p>
                {progress.phase === "planning"
                  ? progress.text
                  : `Beat ${progress.keyframe}/${progress.keyframeCount} · round ${progress.round}/${progress.rounds} · match ${progress.match?.toFixed(2)}`}
              </p>
              {progress.phase === "refining" && (
                <p className="line-clamp-3 normal-case tracking-normal">{progress.text}</p>
              )}
            </div>
          )}
          {error && (
            <p className="font-mono text-xs uppercase tracking-widest text-accent">{error}</p>
          )}
          {saved && (
            <p className="font-mono text-xs uppercase tracking-widest text-foreground/70">
              Saved: {saved}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn px-4 py-2 font-mono text-xs uppercase tracking-widest"
          >
            {busy ? "Working…" : "Generate"}
          </button>
        </form>
      )}
    </div>
  );
}
