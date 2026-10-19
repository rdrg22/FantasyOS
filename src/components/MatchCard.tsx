"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import type { LineupRole, Position, ProbableLineupEntry } from "@/lib/domain/types";
import { getTeam } from "@/lib/domain/teams";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/domain/time";
import { PosBadge } from "./ui";
import { Modal } from "./Modal";
import { useAction } from "./useAction";

export interface TeamRoster {
  teamId: string;
  entries: (ProbableLineupEntry & { mine: boolean })[];
  players: { id: string; name: string; position: Position }[];
}

const ROLE_ORDER: LineupRole[] = ["titular", "duda", "suplente", "lesionado", "sancionado"];
const ROLE_LABEL: Record<LineupRole, string> = { titular: "Titulares probables", duda: "Dudas", suplente: "Suplentes / alternativas", lesionado: "Lesionados", sancionado: "Sancionados" };
const ROLE_CLS: Record<LineupRole, string> = { titular: "text-up", duda: "text-gold", suplente: "text-muted", lesionado: "text-down", sancionado: "text-down" };
const SRC: Record<string, string> = { futbolfantasy: "FútbolFantasy", manual: "edición manual", demo: "DEMO" };

export function MatchCard({ matchday, kickoff, date, home, away, homeRank, awayRank }: { matchday: number; kickoff: string | null; date: string; home: TeamRoster; away: TeamRoster; homeRank: number | null; awayRank: number | null }) {
  const [open, setOpen] = useState(false);
  const h = getTeam(home.teamId)!;
  const a = getTeam(away.teamId)!;
  const mineCount = [...home.entries, ...away.entries].filter((e) => e.mine).length;
  const hasData = home.entries.length + away.entries.length > 0;

  return (
    <article className="panel overflow-hidden">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="flex flex-1 items-center justify-end gap-2 text-right">
          <span className="font-display font-semibold">{h.name}</span>
          {homeRank && <span className="text-[11px] text-dim">{homeRank}º</span>}
          <span className="h-6 w-1.5 rounded" style={{ background: h.color }} />
        </div>
        <div className="w-36 text-center">
          <div className="num text-[12.5px] font-medium">{kickoff ? fmtDateTime(kickoff) : fmtDate(date)}</div>
          <div className="text-[10.5px] text-dim">{kickoff ? "hora de Madrid" : "hora por confirmar"}</div>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <span className="h-6 w-1.5 rounded" style={{ background: a.color }} />
          {awayRank && <span className="text-[11px] text-dim">{awayRank}º</span>}
          <span className="font-display font-semibold">{a.name}</span>
        </div>
        <div className="hidden w-28 text-right sm:block">
          {mineCount > 0 && <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-[11px] text-cyan">{mineCount} tuyos</span>}
          {!hasData && <span className="text-[11px] text-dim">sin alineación</span>}
        </div>
        <ChevronDown size={16} className={`text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-4 md:grid-cols-2">
          <TeamColumn roster={home} matchday={matchday} />
          <TeamColumn roster={away} matchday={matchday} />
        </div>
      )}
    </article>
  );
}

function TeamColumn({ roster, matchday }: { roster: TeamRoster; matchday: number }) {
  const [edit, setEdit] = useState<Partial<ProbableLineupEntry> | null>(null);
  const { run, busy } = useAction();
  const team = getTeam(roster.teamId)!;
  const pos = new Map(roster.players.map((p) => [p.id, p.position]));
  const latest = roster.entries.reduce<string | null>((m, e) => (!m || e.updatedAt > m ? e.updatedAt : m), null);
  const sources = [...new Set(roster.entries.map((e) => SRC[e.source] ?? e.source))];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display font-semibold">{team.name}</h4>
        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => setEdit({ role: "titular", probability: null })}>
          <Plus size={12} /> Añadir
        </button>
      </div>
      <p className="mb-2 text-[11px] text-dim">{roster.entries.length ? <>Fuente: {sources.join(" + ")} · actualizado {timeAgo(latest)}</> : "Sin datos: impórtalos o añádelos a mano."}</p>
      {ROLE_ORDER.map((role) => {
        const list = roster.entries.filter((e) => e.role === role).sort((x, y) => (y.probability ?? 0) - (x.probability ?? 0));
        if (!list.length) return null;
        return (
          <div key={role} className="mb-2.5">
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${ROLE_CLS[role]}`}>{ROLE_LABEL[role]} ({list.length})</div>
            <ul className="space-y-0.5">
              {list.map((e) => (
                <li key={e.id} className={`group flex items-center gap-2 rounded px-1.5 py-0.5 text-[12.5px] ${e.mine ? "bg-cyan/10" : ""}`}>
                  {e.playerId && pos.get(e.playerId) ? <PosBadge pos={pos.get(e.playerId)!} /> : <span className="w-9" />}
                  <span className="min-w-0 flex-1 truncate">
                    {e.playerName}
                    {e.mine && <span className="ml-1 text-[10px] text-cyan">TUYO</span>}
                    {e.manual && <span className="ml-1 text-[10px] text-violet">manual</span>}
                    {!e.playerId && <span className="ml-1 text-[10px] text-dim" title="No se ha podido vincular con el catálogo">sin vincular</span>}
                  </span>
                  <span className="num w-10 text-right text-muted">{e.probability != null ? `${Math.round(e.probability * 100)}%` : "—"}</span>
                  <button className="text-dim opacity-0 hover:text-fg group-hover:opacity-100" onClick={() => setEdit(e)} aria-label="Editar"><Pencil size={12} /></button>
                  <button className="text-dim opacity-0 hover:text-down group-hover:opacity-100" disabled={busy} onClick={() => run({ type: "deleteLineupEntry", id: e.id })} aria-label="Eliminar"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {edit && <EditEntry roster={roster} matchday={matchday} entry={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditEntry({ roster, matchday, entry, onClose }: { roster: TeamRoster; matchday: number; entry: Partial<ProbableLineupEntry>; onClose: () => void }) {
  const [playerId, setPlayerId] = useState(entry.playerId ?? "");
  const [name, setName] = useState(entry.playerName ?? "");
  const [role, setRole] = useState<LineupRole>(entry.role ?? "titular");
  const [prob, setProb] = useState(entry.probability != null ? String(Math.round(entry.probability * 100)) : "");
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={`${entry.id ? "Editar" : "Añadir"} · ${getTeam(roster.teamId)?.name}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = roster.players.find((x) => x.id === playerId);
          const r = await run({
            type: "upsertLineupEntry",
            id: entry.id,
            matchday,
            teamId: roster.teamId,
            playerName: p?.name ?? name,
            playerId: p?.id ?? null,
            role,
            probability: prob === "" ? null : Math.max(0, Math.min(100, Number(prob))) / 100,
          });
          if (r.ok) onClose();
        }}
      >
        <div>
          <label className="label">Jugador</label>
          <select className="input" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">— escribir nombre a mano —</option>
            {roster.players.sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}
          </select>
          {!playerId && <input className="input mt-2" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Situación</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as LineupRole)}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Prob. de jugar (%)</label>
            <input className="input num" type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} placeholder="opcional" />
          </div>
        </div>
        <p className="text-[11.5px] text-dim">Las ediciones manuales se conservan aunque vuelvas a importar desde la fuente y actualizan el estado del jugador.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
