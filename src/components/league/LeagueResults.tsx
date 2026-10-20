"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTeam } from "@/lib/domain/teams";
import { Jersey } from "../Jersey";
import { fmtDate, fmtDateTime } from "@/lib/domain/time";

export interface MatchdayResults {
  matchday: number;
  matches: { id: string; homeId: string; awayId: string; homeScore: number | null; awayScore: number | null; kickoff: string | null; date: string }[];
}

/** Resultados de una jornada, con flechas para moverse entre jornadas. */
export function LeagueResults({ matchdays, initial }: { matchdays: MatchdayResults[]; initial: number }) {
  const [md, setMd] = useState(initial);
  const idx = matchdays.findIndex((m) => m.matchday === md);
  const cur = matchdays[idx];
  if (!cur) return <section className="panel p-5 text-sm text-muted">Sin calendario todavía.</section>;
  const played = cur.matches.filter((m) => m.homeScore != null).length;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button className="btn-ghost !px-2" disabled={idx <= 0} onClick={() => setMd(matchdays[idx - 1].matchday)} aria-label="Jornada anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <h2 className="font-display text-[16.5px] font-semibold">Jornada {cur.matchday}</h2>
          <div className="text-[11.5px] text-muted">{played === cur.matches.length ? "Finalizada" : played ? `${played} de ${cur.matches.length} jugados` : "Por jugar"}</div>
        </div>
        <button className="btn-ghost !px-2" disabled={idx >= matchdays.length - 1} onClick={() => setMd(matchdays[idx + 1].matchday)} aria-label="Jornada siguiente">
          <ChevronRight size={16} />
        </button>
      </div>
      <ul className="divide-y divide-line/70">
        {cur.matches.map((m) => {
          const h = getTeam(m.homeId);
          const a = getTeam(m.awayId);
          const done = m.homeScore != null && m.awayScore != null;
          const homeWin = done && m.homeScore! > m.awayScore!;
          const awayWin = done && m.awayScore! > m.homeScore!;
          return (
            <li key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2.5 text-sm">
              <span className={`flex items-center justify-end gap-2 truncate text-right ${homeWin ? "font-semibold" : done ? "text-muted" : ""}`}>
                <span className="truncate">{h?.name ?? m.homeId}</span>
                <Jersey teamId={m.homeId} size={22} />
              </span>
              {done ? (
                <span className="num min-w-14 rounded-md bg-ink-800 px-2 py-0.5 text-center font-display font-semibold">
                  {m.homeScore} - {m.awayScore}
                </span>
              ) : (
                <span className="min-w-14 text-center text-[11.5px] text-muted">{m.kickoff ? fmtDateTime(m.kickoff) : fmtDate(m.date)}</span>
              )}
              <span className={`flex items-center gap-2 truncate ${awayWin ? "font-semibold" : done ? "text-muted" : ""}`}>
                <Jersey teamId={m.awayId} size={22} />
                <span className="truncate">{a?.name ?? m.awayId}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
