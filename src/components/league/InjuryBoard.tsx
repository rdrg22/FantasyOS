"use client";

import { useState } from "react";
import type { Position } from "@/lib/domain/types";
import { TEAMS } from "@/lib/domain/teams";
import { fmtCompact } from "@/lib/domain/money";
import { InfoTip, PosBadge, TeamChip } from "../ui";
import { Jersey } from "../Jersey";

export interface InjuryRow {
  id: string;
  name: string;
  teamId: string | null;
  position: Position;
  /** "lesion": lesión confirmada; "molestias": duda o molestias sin determinar */
  kind: "lesion" | "molestias";
  note: string | null;
  value: number | null;
  mine: boolean;
}

type Tab = "lesion" | "molestias";

/** Lesionados y jugadores con molestias o en duda, de toda la liga. */
export function InjuryBoard({ rows }: { rows: InjuryRow[] }) {
  const [tab, setTab] = useState<Tab>("lesion");
  const [team, setTeam] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const list = rows
    .filter((r) => r.kind === tab && (!team || r.teamId === team) && (!onlyMine || r.mine))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || (b.value ?? 0) - (a.value ?? 0));
  const count = (k: Tab) => rows.filter((r) => r.kind === k && (!team || r.teamId === team) && (!onlyMine || r.mine)).length;
  const mineHurt = rows.filter((r) => r.mine).length;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[16.5px] font-semibold">
          Bajas y molestias
          <InfoTip>
            Estado de cada jugador según los partes que recogen las alineaciones probables de FútbolFantasy. «Molestias / duda» incluye a quien está en duda o tiene molestias sin determinar: puede jugar o no. Se actualiza varias veces al día.
          </InfoTip>
        </h2>
        <div className="flex items-center gap-3">
          <select className="input !w-auto !py-1 text-[12.5px]" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filtrar por equipo">
            <option value="">Todos los equipos</option>
            {TEAMS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted">
            <input type="checkbox" className="accent-cyan" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Solo mi equipo
          </label>
        </div>
      </div>
      {mineHurt > 0 && (
        <p className="mb-3 rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-[13px] text-down">
          {mineHurt === 1 ? "Tienes 1 jugador de baja o con molestias." : `Tienes ${mineHurt} jugadores de baja o con molestias.`}
        </p>
      )}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-line p-0.5 text-[12.5px]">
        {(
          [
            ["lesion", "🚑 Lesionados"],
            ["molestias", "⚠️ Molestias / duda"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md py-1.5 ${tab === k ? "bg-cyan/15 text-cyan" : "text-muted hover:text-fg"}`}>
            {label} <span className="num opacity-70">({count(k)})</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {rows.length === 0 ? "Aún no hay partes médicos: se cargan al actualizar las alineaciones." : "Nadie en esta lista."}
        </p>
      ) : (
        <ul className="max-h-[560px] divide-y divide-line/70 overflow-y-auto">
          {list.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 py-2 text-sm ${r.mine ? "bg-cyan/5" : ""}`}>
              <Jersey teamId={r.teamId} size={28} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{r.name}</span>
                  {r.mine && <span className="rounded bg-cyan/15 px-1 text-[10px] text-cyan">TUYO</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <PosBadge pos={r.position} />
                  <TeamChip teamId={r.teamId} short icon={false} />
                  {r.value != null && <span className="num text-[11.5px] text-dim">{fmtCompact(r.value)}</span>}
                </span>
              </span>
              <span className={`max-w-[45%] text-right text-[12px] leading-tight ${r.kind === "lesion" ? "text-down" : "text-gold"}`}>
                {r.note ?? (r.kind === "lesion" ? "Lesionado" : "Duda")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
