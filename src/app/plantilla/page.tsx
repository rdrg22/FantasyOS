import { getRepo } from "@/lib/services/context";
import { buildState, toView } from "@/lib/services/state";
import { fmtMoney, fmtSigned, fmtCompact } from "@/lib/domain/money";
import { Kpi, PageHeader } from "@/components/ui";
import { SquadManager, type SquadRowView, type CatalogItem } from "@/components/squad/SquadManager";

export default async function PlantillaPage() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  const rows: SquadRowView[] = s.squad.map((r) => ({
    player: toView(r.analysis),
    purchasePrice: r.entry.purchasePrice,
    purchaseDate: r.entry.purchaseDate,
    notes: r.entry.notes,
    value: r.value,
    pnl: r.pnl.diff,
    pnlPct: r.pnl.pct,
    inLineup: r.inLineup,
  }));
  const squadIds = new Set(rows.map((r) => r.player.id));
  const catalog: CatalogItem[] = [...s.analyses.values()]
    .filter((a) => !squadIds.has(a.player.id))
    .map((a) => ({ id: a.player.id, name: a.player.name, teamId: a.player.teamId, position: a.player.position, value: a.trend.value, status: a.player.status, source: a.player.source }));
  const totalPnl = rows.reduce((a, r) => a + r.pnl, 0);
  const invested = rows.reduce((a, r) => a + r.purchasePrice, 0);

  return (
    <>
      <PageHeader eyebrow="Gestión" title="Mi equipo" subtitle="Tu plantilla, tu once y tu dinero. Todo se guarda en tu base de datos local y sobrevive a cerrar la web." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Presupuesto" value={fmtMoney(s.settings.budget)} tone={s.settings.budget < 0 ? "down" : "up"} />
        <Kpi label="Valor plantilla" value={<span title={fmtMoney(s.squadValue)}>{fmtCompact(s.squadValue)} €</span>} tone="cyan" sub={`Invertido: ${fmtCompact(invested)}`} />
        <Kpi label="Ganancia / pérdida" value={fmtSigned(totalPnl)} tone={totalPnl >= 0 ? "up" : "down"} sub="sobre precio de compra" />
        <Kpi label="Jugadores" value={`${rows.length}/${s.settings.maxSquadSize}`} sub={`${rows.filter((r) => r.inLineup).length} titulares guardados`} />
        <Kpi label="Puntos esperados del once" value={s.lineupCmp.currentTotal.toFixed(1)} tone="gold" sub={`Recomendado: ${s.lineupRec.total.toFixed(1)} (${s.lineupRec.formation})`} />
      </div>
      <SquadManager
        rows={rows}
        catalog={catalog}
        settings={{ formation: s.settings.formation, useCoach: s.settings.useCoach, lineup: s.settings.lineup, budget: s.settings.budget, maxSquadSize: s.settings.maxSquadSize }}
        transactions={s.transactions}
        valueHistory={s.valueHistory}
        balance={s.balance}
        issues={s.lineupCmp.issues.map((i) => ({ slot: i.slot, message: i.message, severity: i.severity }))}
      />
    </>
  );
}
