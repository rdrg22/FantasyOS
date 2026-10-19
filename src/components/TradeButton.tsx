"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useAction } from "./useAction";
import { MoneyInput } from "./MoneyInput";
import { fmtMoney } from "@/lib/domain/money";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

/** Registra una compra o venta real (mueve el presupuesto). */
export function TradeButton({
  mode,
  playerId,
  playerName,
  suggestedPrice,
  label,
  small = false,
}: {
  mode: "buy" | "sell";
  playerId: string;
  playerName: string;
  suggestedPrice: number | null;
  label?: string;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<number | null>(suggestedPrice);
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState("");
  const [needsForce, setNeedsForce] = useState(false);
  const { run, busy } = useAction();

  async function submit(allowNegative = false) {
    if (price == null || (mode === "buy" && price <= 0)) return;
    const r = await run({ type: mode, playerId, price, date, notes: notes || null, ...(mode === "buy" ? { allowNegative } : {}) });
    if (r.ok) {
      setOpen(false);
      setNeedsForce(false);
    } else if (mode === "buy" && r.error?.startsWith("Presupuesto insuficiente")) setNeedsForce(true);
  }

  return (
    <>
      <button
        className={`${mode === "buy" ? "btn-up" : "btn-down"} ${small ? "!px-2 !py-1 !text-xs" : ""}`}
        onClick={() => {
          setPrice(suggestedPrice);
          setOpen(true);
        }}
      >
        {label ?? (mode === "buy" ? "Registrar compra" : "Registrar venta")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${mode === "buy" ? "Compra" : "Venta"} de ${playerName}`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div>
            <label className="label">{mode === "buy" ? "Precio pagado (€)" : "Precio de venta (€)"}</label>
            <MoneyInput value={price} onChange={setPrice} autoFocus required />
            {suggestedPrice != null && <p className="mt-1 text-[11.5px] text-dim">Valor de referencia: {fmtMoney(suggestedPrice)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required max={todayStr()} />
            </div>
            <div>
              <label className="label">Nota (opcional)</label>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="p. ej. puja ganada" />
            </div>
          </div>
          <p className="text-[12px] text-muted">
            {mode === "buy" ? "Se descontará del presupuesto y el jugador pasará a tu plantilla." : "Se sumará al presupuesto, saldrá de tu plantilla y de tu once."}
          </p>
          {needsForce && (
            <div className="rounded-lg border border-down/40 bg-down/10 p-3 text-[12.5px]">
              Tu saldo quedaría en negativo. LaLiga Fantasy lo permite temporalmente, pero no puntúas si empiezas la jornada en negativo.
              <button type="button" className="btn-down mt-2 w-full" disabled={busy} onClick={() => submit(true)}>
                Registrar igualmente (saldo negativo)
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className={mode === "buy" ? "btn-primary" : "btn-down"} disabled={busy || price == null}>
              {busy ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
