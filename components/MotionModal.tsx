"use client";

import { useState } from "react";
import CornerBrackets from "@/components/CornerBrackets";
import { runMotion, MAX_ITERATIONS, type Progress } from "@/lib/convergence";

export default function MotionModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [poses, setPoses] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPoses([]);
    setProgress(null);
    setDone(false);
    try {
      const res = await fetch("/api/motion/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setPoses(data.poses);

      await runMotion(data.poses, setProgress);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed left-6 top-6 z-20">
      <form
        onSubmit={submit}
        className="relative flex w-[26rem] flex-col gap-3 border border-hairline bg-background p-5"
      >
        <CornerBrackets />
        <p className="font-mono text-xs uppercase tracking-widest">Describe a motion</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={busy}
          placeholder="raise the right arm, then crouch down, then stand back up"
          className="resize-none border border-hairline bg-transparent p-2 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
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
            {MAX_ITERATIONS} · match {progress.match?.toFixed(2)}
            {progress.adjustment && busy && <> · {progress.adjustment}</>}
          </p>
        )}
        {done && (
          <p className="font-mono text-xs uppercase tracking-widest text-foreground/70">Done</p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {busy ? "Working…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
