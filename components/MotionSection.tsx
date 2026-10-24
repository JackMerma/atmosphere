"use client";

import { useEffect, useState } from "react";
import { generateAnimation, type Progress } from "@/lib/animator";
import { createAnimation } from "@/lib/animations";
import {
  CANDIDATES_RANGE,
  ITERATIONS_RANGE,
  MOTION_ROUNDS_RANGE,
  STEP_RANGE,
} from "@/lib/motionSettings";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { toast } from "@/store/useToasts";

/** Long enough for the merge animation to land before the first request goes out. */
const MERGE_SETTLE_MS = 650;

/** How much of the bar polishing the poses takes; the rest is tuning the motion. */
const REFINE_SHARE = 0.8;

/** Fraction of the whole generation done: beats finished, then the motion rounds. */
function overall(progress: Progress | null) {
  if (!progress) return 0;
  if (progress.phase === "tuning") {
    const done = progress.rounds ? progress.round / progress.rounds : 1;
    return REFINE_SHARE + (1 - REFINE_SHARE) * done;
  }
  if (progress.phase !== "refining" || progress.keyframeCount === 0) return 0;
  const beat = progress.keyframe - 1 + (progress.rounds ? progress.round / progress.rounds : 0);
  return Math.min(1, beat / progress.keyframeCount) * REFINE_SHARE;
}

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
 * and, when given, lets the planner direct the timing and the beats in between.
 */
export default function MotionSection() {
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);
  const setGenerating = useAtmosphereStore((s) => s.setGenerating);
  const setMerged = useAtmosphereStore((s) => s.setMerged);
  const settings = useAtmosphereStore((s) => s.settings);
  const setSettings = useAtmosphereStore((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // A visible clock, so a long step reads as working rather than stuck.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setElapsed(0);
    setBusy(true);
    setGenerating(true);
    setProgress(null);

    // A directed run works on the single stage model, so bring the pair together
    // first and let the magnet animation land before the work starts.
    const directed = prompt.trim().length > 0;
    if (directed) {
      setMerged(true);
      await new Promise((r) => setTimeout(r, MERGE_SETTLE_MS));
    }

    try {
      const result = await generateAnimation(prompt, settings, setProgress);
      const animation = await createAnimation(
        result.keyframes,
        result.duration,
        result.loop,
        result.motion
      );
      toast.success(
        `${animation.label} saved · ${result.duration.toFixed(1)}s · ${result.beats} pose${
          result.beats === 1 ? "" : "s"
        }${result.loop ? " · loops" : ""}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the animation.");
    } finally {
      setBusy(false);
      setGenerating(false);
      setMerged(false);
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
            placeholder="Optional. Describe an action and the planner authors every pose it needs, with its own timing (e.g. walking, a cartwheel, hit mid-leap and caught in a web). Leave empty to blend the two states directly."
            className="resize-none border border-hairline bg-transparent p-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 font-mono text-xs uppercase tracking-widest">
            <Slider
              label="Pose rounds"
              value={settings.iterations}
              range={ITERATIONS_RANGE}
              disabled={busy}
              onChange={(iterations) => setSettings({ ...settings, iterations })}
            />
            <Slider
              label="Motion rounds"
              value={settings.motionRounds}
              range={MOTION_ROUNDS_RANGE}
              disabled={busy}
              onChange={(motionRounds) => setSettings({ ...settings, motionRounds })}
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
                  : progress.phase === "tuning"
                    ? `How it moves · round ${progress.round}/${progress.rounds}`
                    : `Pose ${progress.keyframe}/${progress.keyframeCount} · round ${progress.round}/${progress.rounds} · match ${progress.match?.toFixed(2)}`}
              </p>
              {progress.phase === "refining" && (
                <p className="line-clamp-3 normal-case tracking-normal">{progress.text}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            data-loading={busy}
            aria-busy={busy}
            className="btn flex items-center justify-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest"
          >
            {busy && <span aria-hidden className="spinner" />}
            {busy
              ? `${
                  progress?.phase === "refining"
                    ? "Refining…"
                    : progress?.phase === "tuning"
                      ? "Tuning…"
                      : "Directing…"
                } ${elapsed}s`
              : "Generate"}
          </button>
          {busy && (
            <div
              className="rail"
              data-indeterminate={!progress || progress.phase === "planning"}
              role="progressbar"
              aria-label="Generation progress"
            >
              <span style={{ width: `${overall(progress) * 100}%` }} />
            </div>
          )}
        </form>
      )}
    </div>
  );
}
