"use client";

import { Sparkles } from "lucide-react";
import { Pitch, type PitchSlot } from "./Pitch";
import { useAction } from "./useAction";

export function LineupBoard({ recSlots, curSlots, changedSlots, delta }: { recSlots: PitchSlot[]; curSlots: PitchSlot[]; changedSlots: string[]; delta: number }) {
  const { run, busy } = useAction();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="eyebrow text-cyan/80">Recomendado</div>
            <h2 className="font-display text-[16.5px] font-semibold">Once recomendado</h2>
          </div>
          <button className="btn-primary" disabled={busy} onClick={() => run({ type: "applyRecommendedLineup" })}>
            <Sparkles size={14} /> Aplicar a mi equipo
          </button>
        </div>
        <Pitch slots={recSlots} readOnly highlight={new Set(changedSlots)} />
        <p className="mt-2 text-[11.5px] text-dim">Borde verde: cambios respecto a tu once guardado. Debajo de cada titular, las dos mejores alternativas de tu plantilla.</p>
      </section>
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="eyebrow">Guardado</div>
            <h2 className="font-display text-[16.5px] font-semibold">Tu once actual</h2>
          </div>
          <span className={`text-sm ${delta > 0.5 ? "text-up" : "text-muted"}`}>{delta > 0.5 ? `El recomendado suma +${delta.toFixed(1)} pts esperados` : "Tu once está muy cerca del óptimo"}</span>
        </div>
        <Pitch slots={curSlots} readOnly />
        <p className="mt-2 text-[11.5px] text-dim">Punto rojo: jugador con aviso (lesionado, sancionado, sin partido o baja probabilidad). Edítalo en «Mi equipo».</p>
      </section>
    </div>
  );
}
