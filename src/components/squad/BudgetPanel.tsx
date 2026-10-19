"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Transaction } from "@/lib/domain/types";
import { fmtMoney, fmtSigned } from "@/lib/domain/money";
import { fmtDate } from "@/lib/domain/time";
import { MoneyInput } from "../MoneyInput";
import { useAction } from "../useAction";
import { Empty } from "../ui";

export function BudgetPanel({ budget, transactions, balance }: { budget: number; transactions: Transaction[]; balance: { bought: number; sold: number; adjustments: number; realizedProfit: number } }) {
  const [value, setValue] = useState<number | null>(budget);
  const { run, busy } = useAction();

  return (
    <div className="space-y-6">
      <form
        className="panel-inset grid items-end gap-3 p-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (value != null) run({ type: "setBudget", budget: value });
        }}
      >
        <div>
          <label className="label">Presupuesto disponible en LaLiga Fantasy (€)</label>
          <MoneyInput value={value} onChange={setValue} allowNegative required />
          <p className="mt-1 text-[11.5px] text-dim">Úsalo para cuadrar con la app oficial (primas, puntos cobrados, cláusulas…). Queda registrado como ajuste.</p>
        </div>
        <button className="btn-primary" disabled={busy || value == null || value === budget}>Actualizar saldo</button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Compras" value={fmtMoney(balance.bought)} cls="text-down" />
        <Stat label="Ventas" value={fmtMoney(balance.sold)} cls="text-up" />
        <Stat label="Beneficio realizado" value={fmtSigned(balance.realizedProfit)} cls={balance.realizedProfit >= 0 ? "text-up" : "text-down"} />
        <Stat label="Ajustes manuales" value={fmtSigned(balance.adjustments)} cls="text-muted" />
      </div>

      <div>
        <div className="eyebrow mb-2">Historial de operaciones</div>
        {transactions.length === 0 ? (
          <Empty title="Sin operaciones">Las compras, ventas y ajustes de saldo aparecerán aquí.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="table-compact w-full min-w-[560px]">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Jugador / concepto</th>
                  <th className="!text-right">Importe</th>
                  <th className="!text-right">Resultado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const sign = t.type === "venta" || (t.type === "ajuste" && t.playerName.includes("(+)")) ? 1 : -1;
                  return (
                    <tr key={t.id}>
                      <td className="num text-muted">{fmtDate(t.date)}</td>
                      <td>
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] uppercase ${t.type === "compra" ? "bg-down/10 text-down" : t.type === "venta" ? "bg-up/10 text-up" : "bg-ink-700 text-muted"}`}>{t.type}</span>
                      </td>
                      <td>
                        {t.playerName}
                        {t.notes && <div className="text-[11px] text-dim">{t.notes}</div>}
                      </td>
                      <td className={`num text-right ${sign > 0 ? "text-up" : "text-down"}`}>{sign > 0 ? "+" : "−"}{fmtMoney(t.amount)}</td>
                      <td className="num text-right text-[12.5px]">
                        {t.costBasis != null ? <span className={t.amount - t.costBasis >= 0 ? "text-up" : "text-down"}>{fmtSigned(t.amount - t.costBasis)}</span> : <span className="text-dim">—</span>}
                      </td>
                      <td className="text-right">
                        <button
                          className="text-dim hover:text-down"
                          title="Eliminar del historial (no modifica el saldo)"
                          disabled={busy}
                          onClick={() => confirm("¿Eliminar esta operación del historial? El saldo no se modifica.") && run({ type: "deleteTransaction", id: t.id })}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="panel-inset px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`num font-display text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
