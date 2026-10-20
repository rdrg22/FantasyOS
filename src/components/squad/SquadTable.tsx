"use client";

import { useState } from "react";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { fmtCompact, fmtMoney, fmtPct, fmtSigned } from "@/lib/domain/money";
import { fmtDate } from "@/lib/domain/time";
import { Delta, Empty, PosBadge, ProbBar, StatusBadge, TeamChip } from "../ui";
import { TradeButton } from "../TradeButton";
import { EditPlayerModal } from "./EditPlayerModal";
import { useAction } from "../useAction";
import type { SquadRowView } from "./SquadManager";

type SortKey = "pos" | "name" | "value" | "pnl" | "xp" | "trend";

export function SquadTable({ rows, onAdd }: { rows: SquadRowView[]; onAdd: () => void }) {
  const [sort, setSort] = useState<SortKey>("pos");
  const [edit, setEdit] = useState<SquadRowView | null>(null);
  const { run, busy } = useAction();

  if (rows.length === 0)
    return (
      <Empty title="Tu plantilla está vacía" icon={<UserPlus size={22} />}>
        <button className="btn-primary mt-3" onClick={onAdd}>Añadir jugadores</button>
      </Empty>
    );

  const order = "PORDEFMEDDELENT";
  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case "name": return a.player.name.localeCompare(b.player.name);
      case "value": return b.value - a.value;
      case "pnl": return b.pnl - a.pnl;
      case "xp": return b.player.xp - a.player.xp;
      case "trend": return (b.player.pct3 ?? b.player.pct1 ?? -99) - (a.player.pct3 ?? a.player.pct1 ?? -99);
      default: return order.indexOf(a.player.position) - order.indexOf(b.player.position) || b.value - a.value;
    }
  });
  const th = (k: SortKey, label: string, right = false) => (
    <th className={`cursor-pointer select-none ${right ? "!text-right" : ""} ${sort === k ? "!text-cyan" : ""}`} onClick={() => setSort(k)}>
      {label}
    </th>
  );

  return (
    <>
      <div className="-mx-4 overflow-x-auto">
        <table className="table-compact w-full min-w-[760px]">
          <thead>
            <tr>
              {th("pos", "Pos")}
              {th("name", "Jugador")}
              <th className="!text-right">Compra</th>
              {th("value", "Valor", true)}
              {th("pnl", "+/−", true)}
              {th("trend", "Tend. 3d", true)}
              <th>Estado</th>
              <th>Juega</th>
              {th("xp", "Pts esp.", true)}
              <th className="!text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.player.id}>
                <td><PosBadge pos={r.player.position} /></td>
                <td>
                  <div className="flex items-center gap-1.5 whitespace-nowrap font-medium">
                    {r.player.name}
                    {r.inLineup && <span className="rounded bg-cyan/15 px-1 text-[10px] text-cyan">XI</span>}
                    {r.player.overridden.length > 0 && <span className="rounded bg-violet/15 px-1 text-[10px] text-violet" title={`Editado a mano: ${r.player.overridden.join(", ")}`}>manual</span>}
                  </div>
                  <TeamChip teamId={r.player.teamId} short />
                </td>
                <td className="num whitespace-nowrap text-right text-muted" title={fmtMoney(r.purchasePrice)}>
                  {fmtCompact(r.purchasePrice)}
                  <div className="text-[10.5px] text-dim">{fmtDate(r.purchaseDate)}</div>
                </td>
                <td className="num whitespace-nowrap text-right font-semibold" title={fmtMoney(r.value)}>{fmtCompact(r.value)}</td>
                <td className={`num whitespace-nowrap text-right ${r.pnl >= 0 ? "text-up" : "text-down"}`}>
                  {fmtSigned(r.pnl)}
                  <div className="text-[10.5px] opacity-75">{fmtPct(r.pnlPct)}</div>
                </td>
                <td className="text-right"><Delta pct={r.player.pct3 ?? r.player.pct1} size="xs" /></td>
                <td><StatusBadge status={r.player.status} note={r.player.statusNote} /></td>
                <td><ProbBar p={r.player.pPlay} source={r.player.pPlaySource} /></td>
                <td className="num text-right text-gold">{r.player.xp.toFixed(1)}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <TradeButton mode="sell" small playerId={r.player.id} playerName={r.player.name} suggestedPrice={r.value} label="Vender" />
                    <button className="btn-ghost !px-2 !py-1" title="Editar datos" onClick={() => setEdit(r)}>
                      <Pencil size={13} />
                    </button>
                    <button
                      className="btn-ghost !px-2 !py-1"
                      title="Quitar sin registrar venta (corrección)"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`¿Quitar a ${r.player.name} de la plantilla sin registrar una venta? El presupuesto no cambia.`)) run({ type: "removeFromSquad", playerId: r.player.id });
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <EditPlayerModal row={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
