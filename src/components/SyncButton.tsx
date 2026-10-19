"use client";

import { RefreshCw } from "lucide-react";
import { useAction } from "./useAction";
import { useToast } from "./Toast";

export function SyncButton({ kind, label, force = false, ghost = false }: { kind: "market" | "fixtures" | "lineups" | "all"; label: string; force?: boolean; ghost?: boolean }) {
  const { run, busy } = useAction();
  const toast = useToast();
  return (
    <button
      className={ghost ? "btn-ghost" : "btn-primary"}
      disabled={busy}
      onClick={async () => {
        const r = await run({ type: "sync", kind, force }, { silent: true });
        if (r.ok) {
          const d = r.data as { failed: number } | undefined;
          toast(d && d.failed > 0 ? "error" : "ok", r.message ?? "Sincronizado");
        }
      }}
    >
      <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
      {busy ? "Sincronizando…" : label}
    </button>
  );
}
