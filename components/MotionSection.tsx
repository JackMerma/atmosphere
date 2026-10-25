"use client";

import { useEffect, useState } from "react";
import { generateAnimation, type Progress } from "@/lib/animator";
import { createAnimation } from "@/lib/animations";
import { BATCHES_RANGE, OPTIONS_PER_QUERY_RANGE, RANKED_RANGE } from "@/lib/motionSettings";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";
import { toast } from "@/store/useToasts";

/** Long enough for the merge animation to land before the first request goes out. */
const MERGE_SETTLE_MS = 650;

/** Fraction of the whole generation done: poses chosen out of poses planned. */
function overall(progress: Progress | null) {
  if (!progress || progress.phase !== "choosing" || progress.keyframeCount === 0) return 0;
  return Math.min(1, (progress.keyframe - 1) / progress.keyframeCount);
}

/** CSS variable the .range track uses to paint its filled portion. */
const fill = (value: number, range: { min: number; max: number }) =>
  ({ "--fill": `${((value - range.min) / (range.max - range.min)) * 100}%` }) as React.CSSProperties;

interface SliderProps {
  label: string;
  hint?: string;
  value: number;
  range: { min: number; max: number };
  disabled: boolean;
  onChange: (value: number) => void;
}

function Slider({ label, hint, value, range, disabled, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-3">
        {label} · {value}
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="range w-28"
          style={fill(value, range)}
        />
      </span>
      {hint && <span className="normal-case tracking-normal text-foreground/60">{hint}</span>}
    </label>
  );
}

/**
 * Collapsible Motion controls inside the main panel.
 *
 * Every animation is directed: the planner authors the poses the action is made
 * of, and Jev chooses each one out of the harvested vocabulary. A prompt is
 * required, so Generate stays disabled until there is one.
 */
export default function MotionSection() {
  const hasJoints = useAtmosphereStore((s) => s.joints.length > 0);
  const setGenerating = useAtmosphereStore((s) => s.setGenerating);
  const setMerged = useAtmosphereStore((s) => s.setMerged);
  const dualState = useAtmosphereStore((s) => s.dualState);
  const settings = useAtmosphereStore((s) => s.settings);
  const setSettings = useAtmosphereStore((s) => s.setSettings);
  const openPanel = useAtmosphereStore((s) => s.openPanel);
  const setOpenPanel = useAtmosphereStore((s) => s.setOpenPanel);
  const open = openPanel === "motion";
  const [prompt, setPrompt] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const described = prompt.trim().length > 0;

  // A visible clock, so a long step reads as working rather than stuck.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!described) return;
    setElapsed(0);
    setBusy(true);
    setGenerating(true);
    setProgress(null);

    // The work happens on the single stage model. With a final state pinned,
    // bring the pair together first and let the magnet animation land before it
    // starts; with none, there is nothing on the other side of the stage to
    // merge with.
    if (dualState) {
      setMerged(true);
      await new Promise((r) => setTimeout(r, MERGE_SETTLE_MS));
    }

    try {
      const result = await generateAnimation(prompt, settings, setProgress);
      const animation = await createAnimation(
        result.keyframes,
        result.duration,
        result.loop,
        result.motion,
        result.title
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
        onClick={() => setOpenPanel(open ? null : "motion")}
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
            placeholder="Describe an action and the planner authors every pose it needs, with its own timing (e.g. walking, a cartwheel, hit mid-leap and caught in a web)."
            className="resize-none border border-hairline bg-transparent p-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 font-mono text-xs uppercase tracking-widest">
            <Slider
              label="Ranked poses"
              hint="How many of the nearest vocabulary poses compete for each pose of the plan. Chosen by measurement, which costs nothing."
              value={settings.rankedPoses}
              range={RANKED_RANGE}
              disabled={busy}
              onChange={(rankedPoses) => setSettings({ ...settings, rankedPoses })}
            />
            <Slider
              label="Options per query"
              hint="How many of them Jev compares in one question; the rest are played off in further rounds. At 1 Jev is not asked at all and the measured nearest wins, which is how to see what asking is worth."
              value={settings.optionsPerQuery}
              range={OPTIONS_PER_QUERY_RANGE}
              disabled={busy}
              onChange={(optionsPerQuery) => setSettings({ ...settings, optionsPerQuery })}
            />
            <Slider
              label="Batches"
              hint="How many questions of a round are asked at the same time."
              value={settings.batches}
              range={BATCHES_RANGE}
              disabled={busy}
              onChange={(batches) => setSettings({ ...settings, batches })}
            />
          </div>

          {progress && (
            <div className="flex flex-col gap-1 font-mono text-xs uppercase tracking-widest text-foreground/70">
              <p>
                {progress.phase === "planning"
                  ? progress.text
                  : `Choosing pose ${progress.keyframe}/${progress.keyframeCount}`}
              </p>
              {progress.phase === "choosing" && (
                <p className="line-clamp-3 normal-case tracking-normal">{progress.text}</p>
              )}
            </div>
          )}

          {/* The whole sequence the planner authored, readable, the moment it
              arrives -- before Jev has chosen a single one of them. */}
          {progress && progress.planned.length > 0 && (
            <ol className="flex flex-col gap-1 border border-hairline p-2 font-mono text-xs normal-case tracking-normal">
              {progress.planned.map((text, i) => {
                const done = i < progress.keyframe - 1;
                const current = i === progress.keyframe - 1;
                return (
                  <li
                    key={i}
                    className={`truncate ${
                      current ? "text-accent" : done ? "text-foreground/70" : "text-foreground/40"
                    }`}
                  >
                    {done ? "✓" : current ? "→" : i + 1}. {text}
                  </li>
                );
              })}
            </ol>
          )}

          <button
            type="submit"
            disabled={busy || !described}
            data-loading={busy}
            aria-busy={busy}
            className="btn flex items-center justify-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest"
          >
            {busy && <span aria-hidden className="spinner" />}
            {busy
              ? `${progress?.phase === "choosing" ? "Choosing…" : "Directing…"} ${elapsed}s`
              : described
                ? "Generate"
                : "Describe a motion first"}
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
