"use client";

import { useState } from "react";
import type { Position } from "@/lib/domain/types";
import { InfoTip, PosBadge, TeamChip } from "../ui";
import { Jersey } from "../Jersey";

export interface CardRow {
  id: string;
  name: string;
  teamId: string | null;
  position: Position;
  yellow: number;
  red: number;
  warned: boolean;
  suspended: boolean;
  mine: boolean;
}

type Tab = "apercibidos" | "amarillas" | "rojas";

/** Tarjetas de la temporada: apercibidos, más amarillas y más rojas. */
export function CardsBoard({ rows }: { rows: CardRow[] }) {
  const [tab, setTab] = useState<Tab>("apercibidos");
  const [onlyMine, setOnlyMine] = useState(false);
  const base = rows.filter((r) => !onlyMine || r.mine);
  const list =
    tab === "apercibidos"
      ? base.filter((r) => r.warned || r.suspended).sort((a, b) => Number(b.suspended) - Number(a.suspended) || b.yellow - a.yellow)
      : tab === "amarillas"
        ? base.filter((r) => r.yellow > 0).sort((a, b) => b.yellow - a.yellow || a.name.localeCompare(b.name))
        : base.filter((r) => r.red > 0).sort((a, b) => b.red - a.red || b.yellow - a.yellow);
  const mineWarned = rows.filter((r) => r.mine && r.warned).length;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[16.5px] font-semibold">
          Tarjetas
          <InfoTip>
            Apercibido: a una amarilla de cumplir sanción (en LaLiga, cada 5 amarillas son un partido de suspensión). Los datos salen de las páginas de partido de FútbolFantasy. Las faltas por jugador no están disponibles en fuentes gratuitas.
          </InfoTip>
        </h2>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <input type="checkbox" className="accent-cyan" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Solo mi equipo
        </label>
      </div>
      {mineWarned > 0 && (
        <p className="mb-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[13px] text-gold">
          {mineWarned === 1 ? "Tienes 1 jugador apercibido" : `Tienes ${mineWarned} jugadores apercibidos`}: si ven una amarilla más, se pierden el siguiente partido.
        </p>
      )}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-line p-0.5 text-[12.5px]">
        {(
          [
            ["apercibidos", "Apercibidos"],
            ["amarillas", "🟨 Amarillas"],
            ["rojas", "🟥 Rojas"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md py-1.5 ${tab === k ? "bg-cyan/15 text-cyan" : "text-muted hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {rows.length === 0 ? "Aún no hay datos de tarjetas: se cargan al actualizar las alineaciones." : "Nadie en esta lista."}
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {list.slice(0, 25).map((r, i) => (
            <li key={r.id} className={`flex items-center gap-2 py-2 text-sm ${r.mine ? "bg-cyan/5" : ""}`}>
              <span className="num w-5 text-right text-[12px] text-dim">{i + 1}</span>
              <Jersey teamId={r.teamId} size={28} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{r.name}</span>
                  {r.mine && <span className="rounded bg-cyan/15 px-1 text-[10px] text-cyan">TUYO</span>}
                </span>
                <span className="flex items-center gap-1.5"><PosBadge pos={r.position} /><TeamChip teamId={r.teamId} short icon={false} /></span>
              </span>
              {tab === "apercibidos" ? (
                <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11.5px] ${r.suspended ? "bg-down/12 text-down" : "bg-gold/12 text-gold"}`}>
                  {r.suspended ? "Sancionado" : `${r.yellow} 🟨 · a 1 de sanción`}
                </span>
              ) : (
                <span className="num flex items-center gap-2 whitespace-nowrap text-[13px]">
                  <span className={tab === "amarillas" ? "font-semibold" : "text-muted"}>🟨 {r.yellow}</span>
                  <span className={tab === "rojas" ? "font-semibold" : "text-muted"}>🟥 {r.red}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
