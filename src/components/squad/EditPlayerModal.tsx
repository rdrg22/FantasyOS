"use client";

import { useState } from "react";
import { Modal } from "../Modal";
import { MoneyInput } from "../MoneyInput";
import { useAction } from "../useAction";
import { TEAMS } from "@/lib/domain/teams";
import { POSITIONS, POSITION_LABEL, STATUS_LABEL, type PlayerStatus, type Position } from "@/lib/domain/types";
import type { SquadRowView } from "./SquadManager";

export function EditPlayerModal({ row, onClose }: { row: SquadRowView; onClose: () => void }) {
  const p = row.player;
  const { run, busy } = useAction();
  const [purchasePrice, setPurchasePrice] = useState<number | null>(row.purchasePrice);
  const [purchaseDate, setPurchaseDate] = useState(row.purchaseDate);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [value, setValue] = useState<number | null>(p.value);
  const [status, setStatus] = useState<PlayerStatus>(p.status);
  const [position, setPosition] = useState<Position>(p.position);
  const [teamId, setTeamId] = useState<string>(p.teamId ?? "");
  const [prob, setProb] = useState<string>(p.startProb != null ? String(Math.round(p.startProb * 100)) : "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (purchasePrice == null || purchasePrice <= 0) return;
    const patch: Record<string, unknown> = {};
    if (value !== p.value) patch.value = value;
    if (status !== p.status) patch.status = status;
    if (position !== p.position) patch.position = position;
    if ((teamId || null) !== p.teamId) patch.teamId = teamId || null;
    const probNum = prob === "" ? null : Math.max(0, Math.min(100, Number(prob))) / 100;
    if (probNum !== p.startProb) patch.startProb = probNum;
    const hasPatch = Object.keys(patch).length > 0;
    const a = await run({ type: "updateSquad", playerId: p.id, purchasePrice, purchaseDate, notes: notes || null }, { silent: hasPatch });
    if (!a.ok) return;
    if (hasPatch) {
      const b = await run({ type: "updatePlayer", playerId: p.id, ...patch });
      if (!b.ok) return;
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Editar a ${p.name}`}>
      <form onSubmit={save} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-2">Tu compra</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio de compra (€)</label>
              <MoneyInput value={purchasePrice} onChange={setPurchasePrice} required />
            </div>
            <div>
              <label className="label">Fecha de compra</label>
              <input type="date" className="input" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Notas</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="eyebrow mb-2">Datos del jugador (edición manual)</legend>
          <p className="text-[12px] text-dim">Lo que cambies aquí prevalece sobre la sincronización hasta que lo restaures.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor actual (€)</label>
              <MoneyInput value={value} onChange={setValue} />
            </div>
            <div>
              <label className="label">Prob. de jugar (%)</label>
              <input className="input num" type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} placeholder="sin dato" />
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PlayerStatus)}>
                {(Object.keys(STATUS_LABEL) as PlayerStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Posición</label>
              <select className="input" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                {POSITIONS.map((x) => (
                  <option key={x} value={x}>{POSITION_LABEL[x]}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Equipo</label>
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">— sin equipo —</option>
                {TEAMS.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {p.overridden.length > 0 ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={async () => { const r = await run({ type: "resetPlayer", playerId: p.id }); if (r.ok) onClose(); }}>
              Restaurar datos de la fuente
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={busy}>Guardar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
