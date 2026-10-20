"use client";

import { Plus, X } from "lucide-react";
import { getTeam } from "@/lib/domain/teams";
import { Jersey } from "./Jersey";
import type { PlayerStatus, Position } from "@/lib/domain/types";

export interface PitchPlayer {
  id: string;
  name: string;
  teamId: string | null;
  position: Position;
  xp: number;
  pPlay: number;
  status: PlayerStatus;
  sub?: string;
  alert?: string | null;
}

export interface PitchSlot {
  slot: string;
  position: Position;
  player: PitchPlayer | null;
  alternatives?: PitchPlayer[];
}

const ROW_ORDER: Position[] = ["DEL", "MED", "DEF", "POR"];

export function Pitch({
  slots,
  selected,
  onSlotClick,
  onDropPlayer,
  onClear,
  readOnly = false,
  highlight,
}: {
  slots: PitchSlot[];
  selected?: string | null;
  onSlotClick?: (slot: string) => void;
  onDropPlayer?: (slot: string, playerId: string, fromSlot: string | null) => void;
  onClear?: (slot: string) => void;
  readOnly?: boolean;
  highlight?: Set<string>;
}) {
  const coach = slots.find((s) => s.position === "ENT");
  return (
    <div className="pitch relative overflow-hidden rounded-2xl px-2 py-5 sm:px-4">
      <PitchLines />
      <div className="relative flex min-h-[520px] flex-col justify-between gap-3">
        {ROW_ORDER.map((pos) => {
          const row = slots.filter((s) => s.position === pos);
          return (
            <div key={pos} className="flex items-start justify-center gap-1.5 sm:gap-4">
              {row.map((s) => (
                <SlotCard
                  key={s.slot}
                  s={s}
                  selected={selected === s.slot}
                  highlight={highlight?.has(s.slot)}
                  readOnly={readOnly}
                  onClick={() => onSlotClick?.(s.slot)}
                  onDrop={(pid, from) => onDropPlayer?.(s.slot, pid, from)}
                  onClear={onClear ? () => onClear(s.slot) : undefined}
                />
              ))}
            </div>
          );
        })}
      </div>
      {coach && (
        <div className="relative mt-4 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
          <span className="eyebrow text-white/50">Entrenador</span>
          <SlotCard s={coach} selected={selected === coach.slot} readOnly={readOnly} onClick={() => onSlotClick?.(coach.slot)} onDrop={(pid, from) => onDropPlayer?.(coach.slot, pid, from)} onClear={onClear ? () => onClear(coach.slot) : undefined} />
        </div>
      )}
    </div>
  );
}

function SlotCard({
  s,
  selected,
  highlight,
  readOnly,
  onClick,
  onDrop,
  onClear,
}: {
  s: PitchSlot;
  selected: boolean;
  highlight?: boolean;
  readOnly: boolean;
  onClick: () => void;
  onDrop: (playerId: string, fromSlot: string | null) => void;
  onClear?: () => void;
}) {
  const p = s.player;
  const dnd = !readOnly
    ? {
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const pid = e.dataTransfer.getData("text/player");
          const from = e.dataTransfer.getData("text/slot") || null;
          if (pid) onDrop(pid, from);
        },
      }
    : {};

  if (!p) {
    return (
      <button
        {...dnd}
        disabled={readOnly}
        onClick={onClick}
        className={`flex w-[60px] flex-col items-center gap-1 min-[400px]:w-[68px] sm:w-[96px] ${readOnly ? "cursor-default" : ""}`}
        title={readOnly ? "Sin jugador" : "Selecciona y elige un jugador de la lista"}
      >
        <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed ${selected ? "border-cyan bg-cyan/15 text-cyan" : "border-white/30 text-white/50"}`}>
          <Plus size={18} />
        </span>
        <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/70">{s.slot.replace("-", " ")}</span>
      </button>
    );
  }

  const team = getTeam(p.teamId);
  const pct = Math.round(p.pPlay * 100);
  const bad = p.status === "lesionado" || p.status === "sancionado" || !!p.alert;
  return (
    <div
      {...dnd}
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/player", p.id);
        e.dataTransfer.setData("text/slot", s.slot);
      }}
      onClick={onClick}
      className={`group relative w-[60px] cursor-pointer select-none min-[400px]:w-[68px] sm:w-[104px] ${readOnly ? "cursor-default" : "active:scale-[0.98]"}`}
      title={p.alert ?? `${p.name} · ${p.xp.toFixed(1)} pts esperados · ${pct}% de jugar`}
    >
      <Jersey teamId={p.teamId} size={40} className="relative z-10 mx-auto -mb-2 drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)] sm:h-[52px] sm:w-[52px]" title={team?.name} />
      <div
        className={`overflow-hidden rounded-lg border bg-ink-900/90 shadow-lg backdrop-blur transition ${
          selected ? "border-cyan ring-2 ring-cyan/40" : highlight ? "border-up ring-2 ring-up/30" : bad ? "border-down/70" : "border-white/15 group-hover:border-cyan/60"
        }`}
      >
        <div className="px-1.5 pb-1.5 pt-2">
          <div className="truncate text-center text-[10.5px] font-semibold leading-tight sm:text-[12.5px]">{p.name}</div>
          <div className="mt-0.5 flex items-center justify-between font-mono text-[9.5px] text-white/60">
            <span>{team?.short ?? "—"}</span>
            <span className="text-gold">{p.xp.toFixed(1)}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${pct >= 70 ? "bg-up" : pct >= 40 ? "bg-gold" : "bg-down"}`} style={{ width: `${pct}%` }} />
          </div>
          {p.sub && <div className="mt-1 truncate text-center text-[9.5px] text-white/50">{p.sub}</div>}
        </div>
      </div>
      {bad && <span className="absolute right-1 top-0 h-3 w-3 rounded-full border-2 border-ink-900 bg-down" />}
      {onClear && !readOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="absolute left-0 top-0 hidden h-4 w-4 items-center justify-center rounded-full bg-ink-700 text-white/80 group-hover:flex"
          aria-label="Quitar del once"
        >
          <X size={10} />
        </button>
      )}
      {s.alternatives && s.alternatives.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {s.alternatives.slice(0, 2).map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded bg-black/45 px-1.5 py-0.5 text-[9.5px] text-white/70">
              <span className="truncate">{a.name}</span>
              <span className="ml-1 font-mono text-gold/80">{a.xp.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PitchLines() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
      <g fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.35">
        <rect x="3" y="2" width="94" height="136" rx="1" />
        <line x1="3" y1="70" x2="97" y2="70" />
        <circle cx="50" cy="70" r="11" />
        <rect x="24" y="2" width="52" height="20" />
        <rect x="37" y="2" width="26" height="7" />
        <rect x="24" y="118" width="52" height="20" />
        <rect x="37" y="131" width="26" height="7" />
      </g>
    </svg>
  );
}
