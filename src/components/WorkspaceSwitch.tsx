"use client";

import { useState } from "react";
import { useToast } from "./Toast";

export function WorkspaceSwitch({ workspace }: { workspace: "real" | "demo" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function change(ws: "real" | "demo") {
    if (ws === workspace) return;
    setBusy(true);
    const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: ws }) });
    setBusy(false);
    if (!res.ok) return toast("error", "No se pudo cambiar el espacio de datos.");
    toast("ok", ws === "demo" ? "Modo demostración: datos ficticios." : "Datos reales.");
    window.location.reload();
  }

  return (
    <div className="panel-inset p-1">
      <div className="grid grid-cols-2 gap-1 text-[12px] font-medium">
        {(["real", "demo"] as const).map((ws) => (
          <button
            key={ws}
            disabled={busy}
            onClick={() => change(ws)}
            className={`rounded-lg px-2 py-1.5 transition-colors ${
              workspace === ws ? (ws === "demo" ? "bg-gold/15 text-gold" : "bg-cyan/15 text-cyan") : "text-muted hover:text-fg"
            }`}
          >
            {ws === "real" ? "Mis datos" : "Demo"}
          </button>
        ))}
      </div>
    </div>
  );
}
