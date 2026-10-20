"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useToast } from "./Toast";

type Step = "fixtures" | "results" | "market" | "points" | "lineups";
const LABEL: Record<Step, string> = { fixtures: "calendario", results: "resultados", market: "mercado", points: "puntos", lineups: "alineaciones y tarjetas" };

interface StepResult {
  kind: Step;
  status: "ok" | "error" | "skipped";
  message: string;
  remaining?: number;
  failed?: string[];
}

/**
 * Sincroniza por pasos cortos (cada petición cabe en el límite de una función serverless).
 * Las alineaciones se piden por tandas hasta que no quedan partidos pendientes.
 */
export function SyncButton({ kind, label, force = false, ghost = false }: { kind: Step | Step[] | "all"; label: string; force?: boolean; ghost?: boolean }) {
  const [progress, setProgress] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const steps: Step[] = kind === "all" ? ["fixtures", "results", "market", "points", "lineups"] : Array.isArray(kind) ? kind : [kind];

  async function call(step: Step, exclude: string[], forceThis: boolean): Promise<StepResult | null> {
    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sync", kind: step, force: forceThis, exclude }),
    }).catch(() => null);
    if (!res) {
      toast("error", "No se pudo conectar con el servidor.");
      return null;
    }
    const json = await res.json().catch(() => ({ ok: false, error: `Error HTTP ${res.status}` }));
    if (!json.ok) {
      toast("error", json.error ?? "Error al sincronizar.");
      return null;
    }
    return json.data as StepResult;
  }

  async function run() {
    const lines: string[] = [];
    let failed = false;
    for (const step of steps) {
      setProgress(`Actualizando ${LABEL[step]}…`);
      if (step !== "lineups") {
        const r = await call(step, [], force);
        if (!r) return setProgress(null);
        if (r.status === "error") failed = true;
        lines.push(`${LABEL[step]}: ${r.message}`);
        continue;
      }
      const exclude: string[] = [];
      let last: StepResult | null = null;
      for (let i = 0; i < 12; i++) {
        last = await call("lineups", exclude, force && i === 0);
        if (!last) return setProgress(null);
        exclude.push(...(last.failed ?? []));
        if (!last.remaining) break;
        setProgress(`Alineaciones: quedan ${last.remaining} partidos…`);
      }
      if (last?.status === "error") failed = true;
      if (last) lines.push(`alineaciones: ${last.message}`);
    }
    setProgress(null);
    toast(failed ? "error" : "ok", lines.join("\n"));
    router.refresh();
  }

  return (
    <button className={ghost ? "btn-ghost" : "btn-primary"} disabled={progress != null} onClick={run}>
      <RefreshCw size={15} className={progress ? "animate-spin" : ""} />
      {progress ?? label}
    </button>
  );
}
