"use client";

import { useState } from "react";
import { useAction } from "./useAction";

export function SettingsForm({ teamName, maxSquadSize }: { teamName: string; maxSquadSize: number }) {
  const [name, setName] = useState(teamName);
  const [max, setMax] = useState(String(maxSquadSize));
  const { run, busy } = useAction();
  const maxNum = Number(max);
  const valid = name.trim().length > 0 && Number.isInteger(maxNum) && maxNum >= 11 && maxNum <= 40;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) run({ type: "saveSettings", teamName: name.trim(), maxSquadSize: maxNum });
      }}
    >
      <div>
        <label className="label">Nombre de tu equipo</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </div>
      <div>
        <label className="label">Máximo de jugadores en plantilla</label>
        <input className="input num" type="number" min={11} max={40} value={max} onChange={(e) => setMax(e.target.value)} required />
        <p className="mt-1 text-[11.5px] text-dim">Ajústalo a las reglas de tu liga. Se usa para comprobar si un fichaje necesita una venta.</p>
      </div>
      <button className="btn-primary" disabled={busy || !valid}>Guardar ajustes</button>
    </form>
  );
}

export function DemoReset() {
  const { run, busy } = useAction();
  return (
    <button className="btn-ghost w-full" disabled={busy} onClick={() => confirm("¿Regenerar los datos de demostración? Se perderán los cambios hechos en la demo.") && run({ type: "resetDemo" })}>
      Regenerar datos de demostración
    </button>
  );
}
