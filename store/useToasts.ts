import { create } from "zustand";

export type ToastKind = "error" | "success" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** How long it stays on screen, in milliseconds. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, duration?: number) => void;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 7000;
const MAX_VISIBLE = 4;
let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message, duration = DEFAULT_DURATION) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, duration }].slice(-MAX_VISIBLE) }));
    setTimeout(() => get().dismiss(id), duration);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a message from anywhere, inside or outside React. */
export const toast = {
  error: (message: string) => useToasts.getState().push("error", message, ERROR_DURATION),
  success: (message: string) => useToasts.getState().push("success", message),
  info: (message: string) => useToasts.getState().push("info", message),
};
