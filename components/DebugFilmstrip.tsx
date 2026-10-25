"use client";

import { useState } from "react";
import { useDebugFilm } from "@/store/useDebugFilm";

const THUMB = 72;

/**
 * Every image handed to Jev during the current (or most recent) generation,
 * across every candidate and every angle, as a strip along the bottom of the
 * screen. Debugging only: it is exactly what was sent, in the order it was
 * sent, with nothing summarised away.
 *
 * Grouped by which of the planner's poses each run of images belongs to --
 * `poseText` changes exactly when `chooseLibraryPose` moves on to the next
 * one -- and within that, by candidate, since each candidate's `JUDGE_VIEWS`
 * angles are captured together.
 */
export default function DebugFilmstrip() {
  const frames = useDebugFilm((s) => s.frames);
  // Collapsed by default, like every other panel in this app: debug detail the
  // user opens when they want it, not something that sits in front of the
  // state panels at the bottom of the screen until closed.
  const [open, setOpen] = useState(false);

  if (frames.length === 0) return null;

  // Split into (pose, candidate) runs without assuming anything about how
  // many angles or candidates there were -- just "the text or the candidate
  // changed, start a new group".
  const groups: { poseText: string; candidateLabel: string; distance: number; frames: typeof frames }[] = [];
  for (const frame of frames) {
    const last = groups[groups.length - 1];
    if (last && last.poseText === frame.poseText && last.candidateLabel === frame.candidateLabel) {
      last.frames.push(frame);
    } else {
      groups.push({
        poseText: frame.poseText,
        candidateLabel: frame.candidateLabel,
        distance: frame.distance,
        frames: [frame],
      });
    }
  }

  let lastPoseText: string | null = null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-foreground/70 hover:text-foreground"
      >
        <span>
          Sent to Jev · {frames.length} image{frames.length === 1 ? "" : "s"}
        </span>
        <span aria-hidden className={`transition-transform ${open ? "" : "rotate-180"}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="flex max-h-52 gap-3 overflow-x-auto overflow-y-hidden border-t border-hairline p-3">
          {groups.map((group, gi) => {
            const newPose = group.poseText !== lastPoseText;
            lastPoseText = group.poseText;
            return (
              <div
                key={gi}
                className={`flex shrink-0 flex-col gap-1 ${newPose && gi > 0 ? "border-l border-hairline pl-3" : ""}`}
              >
                {newPose && (
                  <p className="max-w-[50vw] truncate font-mono text-[10px] uppercase tracking-widest text-accent">
                    {group.poseText}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <div className="flex gap-1">
                    {group.frames.map((f, fi) => (
                      <img
                        key={fi}
                        src={f.image}
                        alt={`${f.candidateLabel} · yaw ${f.yaw}°`}
                        title={`${f.candidateLabel} · ${f.distance.toFixed(1)}° · yaw ${f.yaw}°`}
                        width={THUMB}
                        height={THUMB}
                        className="h-[72px] w-[72px] border border-hairline object-cover"
                      />
                    ))}
                  </div>
                  <p className="w-24 shrink-0 truncate font-mono text-[10px] uppercase tracking-widest text-foreground/60">
                    {group.candidateLabel}
                    <br />
                    {group.distance.toFixed(1)}°
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
