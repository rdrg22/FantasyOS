"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

type Toast = { id: number; kind: "ok" | "error"; text: string };
const Ctx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[100] lg:bottom-4 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-rise flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-2xl backdrop-blur ${
              t.kind === "ok" ? "border-up/40 bg-ink-850/95" : "border-down/50 bg-ink-850/95"
            }`}
          >
            {t.kind === "ok" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-up" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0 text-down" />}
            <div className="min-w-0 flex-1 whitespace-pre-line break-words">{t.text}</div>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-dim hover:text-fg" aria-label="Cerrar">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
