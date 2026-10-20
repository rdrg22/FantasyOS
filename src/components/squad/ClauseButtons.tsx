"use client";

import { useState } from "react";
import { Modal } from "../Modal";
import { MoneyInput } from "../MoneyInput";
import { useAction } from "../useAction";
import { fmtCompact, fmtMoney } from "@/lib/domain/money";
import { clauseLevel } from "@/lib/domain/clause";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

/** Cláusula del jugador: muestra el importe y permite fijarla o subirla (con su coste). */
export function ClauseCell({ playerId, playerName, clause, value }: { playerId: string; playerName: string; clause: number | null; value: number }) {
  const [open, setOpen] = useState(false);
  const [newClause, setNewClause] = useState<number | null>(clause);
  const [cost, setCost] = useState<number | null>(0);
  const [date, setDate] = useState(todayStr());
  const { run, busy } = useAction();
  const level = clauseLevel(clause, value);

  async function submit() {
    if (newClause == null || newClause <= 0) return;
    const r = await run({ type: "setClause", playerId, clause: newClause, cost: cost ?? 0, date, notes: cost ? "Subida de cláusula" : null });
    if (r.ok) setOpen(false);
  }

  return (
    <>
      <button
        className="group text-right"
        title={clause != null ? `${fmtMoney(clause)} · ${(clause / Math.max(1, value)).toFixed(2).replace(".", ",")}× su valor` : "Añadir la cláusula"}
        onClick={() => {
          setNewClause(clause ?? value);
          setCost(0);
          setDate(todayStr());
          setOpen(true);
        }}
      >
        {clause != null ? (
          <>
            <div className="num font-semibold group-hover:text-cyan">{fmtCompact(clause)}</div>
            {level && <div className={`text-[10.5px] ${level.cls}`}>{level.label}</div>}
          </>
        ) : (
          <span className="text-[12px] text-cyan underline-offset-2 group-hover:underline">Añadir</span>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Cláusula de ${playerName}`}>
        <form
          className="space-y-3 whitespace-normal text-left"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <label className="label">Cláusula (€)</label>
            <MoneyInput value={newClause} onChange={setNewClause} autoFocus required />
            <p className="mt-1 text-[11.5px] text-dim">
              Valor de mercado: {fmtMoney(value)}
              {clause != null && <> · cláusula actual: {fmtMoney(clause)}</>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Pagado por subirla (€)</label>
              <MoneyInput value={cost} onChange={setCost} />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required max={todayStr()} />
            </div>
          </div>
          <p className="text-[12px] text-muted">
            Si solo apuntas la cláusula que ya tiene, deja el pago en 0. Si la has subido pagando, pon lo que te ha costado y se descontará de tu saldo.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={busy || newClause == null}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Registra que otro mánager te ha quitado al jugador pagando su cláusula. */
export function ClausulazoButton({ playerId, playerName, clause, value }: { playerId: string; playerName: string; clause: number | null; value: number }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<number | null>(clause);
  const [date, setDate] = useState(todayStr());
  const { run, busy } = useAction();

  async function submit() {
    if (price == null) return;
    const r = await run({ type: "sell", playerId, price, date, notes: "Clausulazo: te lo han robado pagando su cláusula" });
    if (r.ok) setOpen(false);
  }

  return (
    <>
      <button
        className="btn-ghost !border-violet/50 !px-2 !py-1 !text-xs text-violet hover:!bg-violet/10"
        title="Te lo han robado pagando su cláusula"
        onClick={() => {
          setPrice(clause ?? value);
          setDate(todayStr());
          setOpen(true);
        }}
      >
        Clausulazo
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Clausulazo a ${playerName}`}>
        <form
          className="space-y-3 whitespace-normal text-left"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-[13px] text-muted">Otro mánager ha pagado la cláusula de {playerName}: sale de tu plantilla y recibes ese dinero.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cláusula cobrada (€)</label>
              <MoneyInput value={price} onChange={setPrice} autoFocus required />
              {clause == null && <p className="mt-1 text-[11.5px] text-dim">No tenías apuntada la cláusula: revisa el importe.</p>}
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required max={todayStr()} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-down" disabled={busy || price == null}>
              {busy ? "Guardando…" : "Confirmar clausulazo"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
