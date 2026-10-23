"use client";

import { useState } from "react";
import CornerBrackets from "@/components/CornerBrackets";

export default function MotionModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [poses, setPoses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPoses([]);
    try {
      const res = await fetch("/api/motion/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setPoses(data.poses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-foreground/20">
      <form
        onSubmit={submit}
        className="relative flex w-[28rem] flex-col gap-3 border border-hairline bg-background p-5"
      >
        <CornerBrackets />
        <p className="font-mono text-xs uppercase tracking-widest">Describe a motion</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="raise the right arm, then crouch down, then stand back up"
          className="resize-none border border-hairline bg-transparent p-2 text-sm outline-none focus:border-accent"
        />
        {error && (
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{error}</p>
        )}
        {poses.length > 0 && (
          <ol className="flex flex-col gap-1 font-mono text-xs uppercase tracking-widest text-foreground/70">
            {poses.map((pose, i) => (
              <li key={i}>
                {i + 1}. {pose}
              </li>
            ))}
          </ol>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className="border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {busy ? "Thinking…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
