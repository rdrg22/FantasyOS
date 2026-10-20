"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, RotateCcw, Sparkles, AlertTriangle } from "lucide-react";
import type { Formation, PlayerStatus, Position, SquadValuePoint, Transaction } from "@/lib/domain/types";
import { FORMATIONS } from "@/lib/domain/types";
import { formationSlots, remapLineup } from "@/lib/domain/formations";
import type { PlayerView } from "@/lib/services/state";
import { Pitch, type PitchSlot } from "../Pitch";
import { useAction } from "../useAction";
import { useToast } from "../Toast";
import { PosBadge } from "../ui";
import { SquadTable } from "./SquadTable";
import { AddPlayerPanel } from "./AddPlayerPanel";
import { BudgetPanel } from "./BudgetPanel";
import { SquadValueChart } from "../charts";

export interface SquadRowView {
  player: PlayerView;
  purchasePrice: number;
  purchaseDate: string;
  notes: string | null;
  value: number;
  pnl: number;
  pnlPct: number | null;
  inLineup: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  teamId: string | null;
  position: Position;
  value: number | null;
  status: PlayerStatus;
  source: string;
}

type Tab = "plantilla" | "anadir" | "dinero" | "evolucion";

export function SquadManager({
  rows,
  catalog,
  settings,
  transactions,
  valueHistory,
  balance,
  issues,
}: {
  rows: SquadRowView[];
  catalog: CatalogItem[];
  settings: { formation: Formation; useCoach: boolean; lineup: Record<string, string | null>; budget: number; maxSquadSize: number };
  transactions: Transaction[];
  valueHistory: SquadValuePoint[];
  balance: { bought: number; sold: number; adjustments: number; realizedProfit: number };
  issues: { slot: string; message: string; severity: string }[];
}) {
  const [tab, setTab] = useState<Tab>(rows.length === 0 ? "anadir" : "plantilla");
  const [formation, setFormation] = useState<Formation>(settings.formation);
  const [useCoach, setUseCoach] = useState(settings.useCoach);
  const [lineup, setLineup] = useState<Record<string, string | null>>(settings.lineup);
  const [selected, setSelected] = useState<string | null>(null);
  const { run, busy } = useAction();
  const toast = useToast();

  // Si el servidor cambia (p. ej. tras vender), sincroniza el estado local.
  const serverKey = JSON.stringify([settings.formation, settings.useCoach, settings.lineup]);
  useEffect(() => {
    setFormation(settings.formation);
    setUseCoach(settings.useCoach);
    setLineup(settings.lineup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.player.id, r.player])), [rows]);
  const dirty = JSON.stringify([formation, useCoach, lineup]) !== serverKey;
  const issueBySlot = new Map(issues.map((i) => [i.slot, i.message]));

  const slots: PitchSlot[] = formationSlots(formation, useCoach).map((s) => {
    const p = lineup[s.slot] ? byId.get(lineup[s.slot]!) : null;
    return {
      slot: s.slot,
      position: s.position,
      player: p ? { id: p.id, name: p.shortName ?? p.name, teamId: p.teamId, position: p.position, xp: p.xp, pPlay: p.pPlay, status: p.status, alert: dirty ? null : issueBySlot.get(s.slot) ?? null } : null,
    };
  });
  const inLineup = new Set(Object.values(lineup).filter(Boolean) as string[]);
  const bench = rows.filter((r) => !inLineup.has(r.player.id)).map((r) => r.player);

  function assign(slot: string, playerId: string, fromSlot: string | null = null) {
    const p = byId.get(playerId);
    const pos = slot.split("-")[0];
    if (!p) return;
    if (p.position !== pos) {
      toast("error", `${p.name} es ${p.position}; ese hueco es de ${pos}.`);
      return;
    }
    setLineup((l) => {
      const next = { ...l };
      const prevSlot = fromSlot ?? Object.keys(next).find((k) => next[k] === playerId) ?? null;
      const displaced = next[slot];
      next[slot] = playerId;
      if (prevSlot && prevSlot !== slot) next[prevSlot] = displaced ?? null;
      return next;
    });
    setSelected(null);
  }

  function clickSlot(slot: string) {
    if (selected && selected !== slot && selected.split("-")[0] === slot.split("-")[0]) {
      // intercambio entre dos huecos de la misma línea
      setLineup((l) => ({ ...l, [slot]: l[selected], [selected]: l[slot] }));
      setSelected(null);
      return;
    }
    setSelected(selected === slot ? null : slot);
  }

  function clickBench(playerId: string) {
    const p = byId.get(playerId)!;
    if (selected) return assign(selected, playerId);
    const free = formationSlots(formation, useCoach).find((s) => s.position === p.position && !lineup[s.slot]);
    if (free) assign(free.slot, playerId);
    else toast("error", "Selecciona primero en el campo el hueco que quieres ocupar.");
  }

  function changeFormation(f: Formation, coach = useCoach) {
    setFormation(f);
    setUseCoach(coach);
    setLineup((l) => remapLineup(l, f, coach));
    setSelected(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
      {/* ── Campo ── */}
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="eyebrow">Tu once inicial</div>
            <h2 className="font-display text-[16.5px] font-semibold">Alineación guardada</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input !w-auto" value={formation} onChange={(e) => changeFormation(e.target.value as Formation)} aria-label="Formación">
              {FORMATIONS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <input type="checkbox" checked={useCoach} onChange={(e) => changeFormation(formation, e.target.checked)} className="accent-cyan" /> Entrenador
            </label>
          </div>
        </div>

        <Pitch
          slots={slots}
          selected={selected}
          onSlotClick={clickSlot}
          onDropPlayer={(slot, pid, from) => assign(slot, pid, from)}
          onClear={(slot) => setLineup((l) => ({ ...l, [slot]: null }))}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={!dirty || busy} onClick={() => run({ type: "saveLineup", formation, useCoach, lineup })}>
            <Save size={15} /> Guardar once
          </button>
          <button className="btn-ghost" disabled={!dirty || busy} onClick={() => { setFormation(settings.formation); setUseCoach(settings.useCoach); setLineup(settings.lineup); }}>
            <RotateCcw size={14} /> Deshacer
          </button>
          <button className="btn-ghost" disabled={busy || rows.length === 0} onClick={() => run({ type: "applyRecommendedLineup" })} title="Sustituye tu once por el recomendado para la próxima jornada">
            <Sparkles size={14} className="text-cyan" /> Usar once recomendado
          </button>
          {dirty && <span className="text-[12px] text-gold">Cambios sin guardar</span>}
        </div>

        {!dirty && issues.length > 0 && (
          <ul className="mt-3 space-y-1">
            {issues.map((i) => (
              <li key={i.slot} className={`flex items-start gap-2 text-[12.5px] ${i.severity === "alta" ? "text-down" : "text-gold"}`}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {i.message}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <div className="eyebrow mb-2">Suplentes · arrastra al campo o haz clic</div>
          {bench.length === 0 ? (
            <p className="text-[12.5px] text-dim">{rows.length ? "Todos tus jugadores están en el once." : "Aún no tienes jugadores."}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {bench
                .sort((a, b) => "PORDEFMEDDELENT".indexOf(a.position) - "PORDEFMEDDELENT".indexOf(b.position) || b.xp - a.xp)
                .map((p) => (
                  <button
                    key={p.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/player", p.id)}
                    onClick={() => clickBench(p.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] transition ${
                      selected && selected.split("-")[0] === p.position ? "border-cyan/60 bg-cyan/10" : "border-line bg-ink-850 hover:border-ink-500"
                    }`}
                    title={`${p.xp.toFixed(1)} pts esperados · ${Math.round(p.pPlay * 100)}% de jugar`}
                  >
                    <PosBadge pos={p.position} />
                    <span className="max-w-[120px] truncate">{p.shortName ?? p.name}</span>
                    <span className="font-mono text-[10.5px] text-gold">{p.xp.toFixed(1)}</span>
                    {(p.status === "lesionado" || p.status === "sancionado") && <span className="h-2 w-2 rounded-full bg-down" />}
                  </button>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Pestañas ── */}
      <section className="panel min-w-0 p-4">
        <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
          {(
            [
              ["plantilla", `Plantilla (${rows.length}/${settings.maxSquadSize})`],
              ["anadir", "Añadir jugador"],
              ["dinero", "Presupuesto y operaciones"],
              ["evolucion", "Evolución"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === k ? "border-cyan text-cyan" : "border-transparent text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "plantilla" && <SquadTable rows={rows} onAdd={() => setTab("anadir")} />}
        {tab === "anadir" && <AddPlayerPanel catalog={catalog} budget={settings.budget} full={rows.length >= settings.maxSquadSize} />}
        {tab === "dinero" && <BudgetPanel budget={settings.budget} transactions={transactions} balance={balance} />}
        {tab === "evolucion" && (
          <div className="space-y-4">
            <SquadValueChart data={valueHistory} />
          </div>
        )}
      </section>
    </div>
  );
}
