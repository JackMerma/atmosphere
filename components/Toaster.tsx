"use client";

import { useToasts, type ToastKind } from "@/store/useToasts";

const LABEL: Record<ToastKind, string> = { error: "Error", success: "Done", info: "Note" };
const MAX_CHARS = 280;

/** Pulls the human message out of an API error that embeds a JSON body, and caps its length. */
function readable(message: string) {
  const inner = message.match(/"message"\s*:\s*"([^"]+)"/);
  const text = (inner ? `${message.split(":")[0]}: ${inner[1]}` : message).replace(/\\n/g, " ");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

/** Top-centre notifications that dismiss themselves, with a bar counting down the time left. */
export default function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="toast pointer-events-auto relative overflow-hidden border bg-background py-3 pl-4 pr-9"
          data-kind={t.kind}
        >
          <p className="font-mono text-xs uppercase tracking-widest" data-label>
            {LABEL[t.kind]}
          </p>
          <p className="mt-1 break-words text-sm">{readable(t.message)}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="absolute right-2 top-2 px-1.5 font-mono text-sm leading-none text-foreground/50 transition-colors hover:text-accent"
          >
            ×
          </button>
          <span
            aria-hidden
            className="toast-bar absolute bottom-0 left-0 h-0.5 w-full"
            style={{ animationDuration: `${t.duration}ms` }}
          />
        </div>
      ))}
    </div>
  );
}
