"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useToast } from "./Toast";

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

/** Envía una acción a /api/actions, muestra el resultado y refresca los datos del servidor. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    async (payload: Record<string, unknown>, opts: { silent?: boolean } = {}): Promise<ActionResult> => {
      setBusy(true);
      try {
        const res = await fetch("/api/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({ ok: false, error: `Error HTTP ${res.status}` }))) as ActionResult;
        if (!json.ok) toast("error", json.error ?? "No se pudo completar la acción.");
        else {
          if (!opts.silent && json.message) toast("ok", json.message);
          startTransition(() => router.refresh());
        }
        return json;
      } catch {
        toast("error", "No se pudo conectar con el servidor.");
        return { ok: false, error: "network" };
      } finally {
        setBusy(false);
      }
    },
    [router, toast],
  );

  return { run, busy: busy || pending };
}
