"use client";

import { useState } from "react";
import CornerBrackets from "@/components/CornerBrackets";
import {
  runMotion,
  ITERATIONS_RANGE,
  STEP_RANGE,
  DEFAULT_SETTINGS,
  type MotionSettings,
  type Progress,
} from "@/lib/convergence";
import { createAnimation } from "@/lib/animations";
import { useAtmosphereStore } from "@/store/useAtmosphereStore";

export default function MotionModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [poses, setPoses] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [settings, setSettings] = useState<MotionSettings>(DEFAULT_SETTINGS);
  const setGenerating = useAtmosphereStore((s) => s.setGenerating);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setGenerating(true);
    setError(null);
    setPoses([]);
    setProgress(null);
    setSaved(null);
    try {
      const res = await fetch("/api/motion/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setPoses(data.poses);

      const keyframes = await runMotion(data.poses, settings, setProgress);
      setSaved((await createAnimation(keyframes, useAtmosphereStore.getState().initialState ?? undefined)).label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
      setGenerating(false);
    }
  }

  return (
    <div className="fixed left-6 top-6 z-20">
      <form
        onSubmit={submit}
        className="relative flex w-[26rem] flex-col gap-3 border border-hairline bg-background p-5"
      >
        <CornerBrackets />
        <p className="font-headline text-lg uppercase tracking-[-0.02em]">Describe a motion</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={busy}
          placeholder="raise the right arm, then crouch down, then stand back up"
          className="resize-none border border-hairline bg-transparent p-2 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
        <div className="flex flex-col gap-2 font-mono text-xs uppercase tracking-widest">
          <label className="flex items-center justify-between gap-3">
            <span>Iterations / pose · {settings.iterations}</span>
            <input
              type="range"
              min={ITERATIONS_RANGE.min}
              max={ITERATIONS_RANGE.max}
              step={1}
              value={settings.iterations}
              disabled={busy}
              onChange={(e) => setSettings({ ...settings, iterations: Number(e.target.value) })}
              className="w-40 accent-accent"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Step size · {settings.stepDegrees}°</span>
            <input
              type="range"
              min={STEP_RANGE.min}
              max={STEP_RANGE.max}
              step={5}
              value={settings.stepDegrees}
              disabled={busy}
              onChange={(e) => setSettings({ ...settings, stepDegrees: Number(e.target.value) })}
              className="w-40 accent-accent"
            />
          </label>
        </div>
        {error && (
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{error}</p>
        )}
        {poses.length > 0 && (
          <ol className="flex flex-col gap-1 font-mono text-xs uppercase tracking-widest text-foreground/70">
            {poses.map((pose, i) => (
              <li
                key={i}
                className={progress?.poseIndex === i && busy ? "text-accent" : undefined}
              >
                {i + 1}. {pose}
              </li>
            ))}
          </ol>
        )}
        {progress && (
          <p className="font-mono text-xs uppercase tracking-widest text-foreground/70">
            Pose {progress.poseIndex + 1}/{progress.poseCount} · step {progress.iteration}/
            {settings.iterations} · match {progress.match?.toFixed(2)}
            {progress.adjustment && busy && <> · {progress.adjustment}</>}
          </p>
        )}
        {saved && (
          <p className="font-mono text-xs uppercase tracking-widest text-foreground/70">
            Saved as {saved}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="btn px-4 py-2 font-mono text-xs uppercase tracking-widest"
          >
            {busy ? "Working…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn px-4 py-2 font-mono text-xs uppercase tracking-widest"
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
