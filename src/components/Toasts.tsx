"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./Icons";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 3500);
    },
    [dismiss],
  );
  return useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
}

const STYLE: Record<ToastKind, string> = {
  success: "border-emerald-400/30 text-emerald-200",
  error: "border-red-400/40 text-red-200",
  info: "border-indigo-400/30 text-indigo-100",
};

export function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border bg-surface-2/95 px-4 py-3 text-sm shadow-2xl backdrop-blur ${STYLE[t.kind]}`}
        >
          <span className="mt-0.5 shrink-0">
            {t.kind === "success" ? <CheckIcon /> : t.kind === "error" ? <AlertIcon /> : <InfoIcon />}
          </span>
          <span className="flex-1 text-ink">{t.text}</span>
          <button className="shrink-0 text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
            <XIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
