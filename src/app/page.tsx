import Link from "next/link";
import { ArrowRight, CalendarClock, HeartPulse, TrendingDown, Wallet, Users, Coins, Zap } from "lucide-react";
import { getRepo } from "@/lib/services/context";
import { buildState, toView } from "@/lib/services/state";
import { topDecisions } from "@/lib/analytics/recommendations";
import { fmtCompact, fmtMoney, fmtSigned } from "@/lib/domain/money";
import { fmtDateTime, fmtDate, madridToIso } from "@/lib/domain/time";
import { getTeam } from "@/lib/domain/teams";
import { Delta, Empty, Freshness, Kpi, PageHeader, PosBadge, ProbBar, ScoreRing, Section, StatusBadge, TeamChip } from "@/components/ui";
import { RecommendationCard } from "@/components/RecommendationCard";
import { SquadValueChart } from "@/components/charts";
import { Countdown } from "@/components/Countdown";
import { SyncButton } from "@/components/SyncButton";

export default async function Dashboard() {
  const { repo, workspace } = await getRepo();
  const s = buildState(repo, workspace);
  const today = s.recommendations.filter((r) => r.action !== "MANTENER");
  const top3 = topDecisions(s.recommendations, 3);
  const rest = today.slice(3, 9);
  const teamOf = (id: string | null) => (id ? s.analyses.get(id)?.player.teamId ?? null : null);
  const ownIds = new Set(s.squad.map((r) => r.entry.playerId));
  const totalPnl = s.squad.reduce((a, r) => a + r.pnl.diff, 0);
  const next = s.calendar.next;

  // Oportunidades del día: mercado registrado o, si no hay, catálogo
  const listingIds = new Set(s.listings.map((l) => l.playerId));
  const pool = [...s.analyses.values()].filter((a) => !ownIds.has(a.player.id) && a.trend.value != null && (listingIds.size ? listingIds.has(a.player.id) : true));
  const opportunities = pool.sort((a, b) => b.opportunity - a.opportunity).slice(0, 6).map(toView);
  const falling = s.squad.filter((r) => r.analysis.trend.direction === "baja" || (r.analysis.trend.pct1 ?? 0) < -1).sort((a, b) => (a.analysis.trend.pct3 ?? a.analysis.trend.pct1 ?? 0) - (b.analysis.trend.pct3 ?? b.analysis.trend.pct1 ?? 0));
  const health = s.squad.filter((r) => r.analysis.player.status !== "disponible" && r.analysis.player.status !== "desconocido" || (r.analysis.pPlaySource !== "supuesto" && r.analysis.pPlay < 0.5));
  const isEmpty = s.squad.length === 0 && s.dataFreshness.playerCount === 0;

  return (
    <>
      <PageHeader
        eyebrow={`${fmtDate(s.today)} · ${workspace === "demo" ? "demostración" : "mis datos"}`}
        title="Qué debería hacer hoy"
        subtitle="Decisiones priorizadas a partir de tu plantilla, tu presupuesto, el mercado y la próxima jornada. Son estimaciones, no certezas: abre cada una para ver motivos, riesgos y datos usados."
        actions={workspace === "real" && <SyncButton kind="all" label="Actualizar datos" />}
      />

      {isEmpty && (
        <div className="panel mb-6 p-6">
          <Empty title="Empieza por cargar datos" icon={<Zap size={22} />}>
            Pulsa «Actualizar datos» para traer precios, puntos, calendario y alineaciones probables, y después añade tus jugadores en{" "}
            <Link href="/plantilla" className="text-cyan underline">Mi equipo</Link>. ¿Solo quieres probar? Cambia a <b>Demo</b> en la barra lateral.
          </Empty>
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Wallet size={13} />} label="Presupuesto disponible" value={<span title={fmtMoney(s.settings.budget)}>{Math.abs(s.settings.budget) >= 1e8 ? fmtCompact(s.settings.budget) + " €" : fmtMoney(s.settings.budget)}</span>} tone={s.settings.budget < 0 ? "down" : "up"} sub={s.settings.budget < 0 ? "¡saldo negativo!" : "saldo para fichar"} />
        <Kpi icon={<Coins size={13} />} label="Valor de la plantilla" value={<span title={fmtMoney(s.squadValue)}>{fmtCompact(s.squadValue)} €</span>} tone="cyan" sub={<>Patrimonio: {fmtCompact(s.squadValue + s.settings.budget)}</>} />
        <Kpi icon={<Users size={13} />} label="Jugadores" value={`${s.squad.length}/${s.settings.maxSquadSize}`} sub={`${s.squad.filter((r) => r.inLineup).length} en tu once`} />
        <Kpi label="Ganancia latente" value={fmtSigned(totalPnl)} tone={totalPnl >= 0 ? "up" : "down"} sub="valor actual − precio de compra" />
        <Kpi label="Balance compra/venta" value={fmtSigned(s.balance.sold - s.balance.bought)} tone={s.balance.sold - s.balance.bought >= 0 ? "up" : "down"} sub={<>Beneficio realizado {fmtSigned(s.balance.realizedProfit)}</>} />
        <div className="panel-inset px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <CalendarClock size={13} /> {next ? `Jornada ${next.matchday}` : "Próxima jornada"}
          </div>
          {next ? (
            <>
              <div className="num mt-1 font-display text-[22px] font-semibold leading-tight text-gold">
                {next.firstKickoff ? <Countdown to={next.firstKickoff} /> : next.firstDate ? <>≈ <Countdown to={madridToIso(next.firstDate, "18:00")} /></> : "—"}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-dim">
                {next.firstKickoff ? <>Cierre aprox.: {fmtDateTime(next.firstKickoff)}</> : <>Desde {fmtDate(next.firstDate)} · hora por confirmar</>}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-muted">Sin calendario</div>
          )}
        </div>
      </div>

      {s.calendar.pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-cyan/20 bg-cyan/5 px-4 py-2 text-[12.5px] text-muted">
          Partidos pendientes antes de la J{next?.matchday ?? "?"}:{" "}
          {s.calendar.pending.map((f) => `${getTeam(f.homeId)?.name}–${getTeam(f.awayId)?.name} (J${f.matchday}, ${fmtDate(f.date)})`).join(" · ")}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section eyebrow="Prioridad máxima" title="Las tres decisiones clave" actions={<Link href="/recomendaciones" className="inline-flex items-center gap-1 text-sm text-cyan hover:underline">Todas <ArrowRight size={14} /></Link>}>
            {top3.length === 0 ? (
              <Empty title="Nada urgente">Con los datos actuales no hay movimientos claros. Registra tu mercado del día o sincroniza para obtener recomendaciones.</Empty>
            ) : (
              <div className="space-y-2.5">
                {top3.map((r, i) => (
                  <RecommendationCard key={r.id} rec={r} rank={i + 1} teamId={teamOf(r.playerId)} defaultOpen={i === 0} ownsPlayer={!!r.playerId && ownIds.has(r.playerId)} />
                ))}
              </div>
            )}
            {rest.length > 0 && (
              <>
                <div className="eyebrow mb-2 mt-5">Después</div>
                <div className="space-y-2">
                  {rest.map((r, i) => (
                    <RecommendationCard key={r.id} rec={r} rank={i + 4} teamId={teamOf(r.playerId)} compact ownsPlayer={!!r.playerId && ownIds.has(r.playerId)} />
                  ))}
                </div>
              </>
            )}
          </Section>

          <Section eyebrow="Evolución" title="Valor de tu equipo" actions={<span className="text-[11.5px] text-dim">un punto por día registrado · línea discontinua: plantilla + saldo</span>}>
            <SquadValueChart data={s.valueHistory} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            eyebrow={s.listings.length ? `Tu mercado del ${fmtDate(s.listingsDate)}` : "Catálogo completo"}
            title="Mejores oportunidades"
            actions={<Link href="/mercado" className="text-sm text-cyan hover:underline">Mercado</Link>}
          >
            {opportunities.length === 0 ? (
              <Empty title="Sin datos de mercado">Sincroniza los precios o registra los jugadores de tu mercado.</Empty>
            ) : (
              <ul className="divide-y divide-line/70">
                {opportunities.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2">
                    <ScoreRing score={p.opportunity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PosBadge pos={p.position} />
                        <span className="truncate font-medium">{p.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3">
                        <TeamChip teamId={p.teamId} short />
                        <span className="text-[11.5px] text-muted">{p.xp.toFixed(1)} pts esp.</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm font-semibold">{fmtCompact(p.value)}</div>
                      <Delta pct={p.pct1} size="xs" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!s.listings.length && opportunities.length > 0 && <p className="mt-2 text-[11.5px] text-dim">No has registrado tu mercado de hoy: se muestran los mejores del catálogo, puede que no estén disponibles para ti.</p>}
          </Section>

          <Section eyebrow="Alertas de valor" title={<span className="inline-flex items-center gap-2"><TrendingDown size={16} className="text-down" /> Tus jugadores bajando</span>}>
            {falling.length === 0 ? (
              <p className="text-sm text-muted">{s.squad.length ? "Ninguno de tus jugadores está perdiendo valor de forma clara." : "Añade jugadores a tu plantilla."}</p>
            ) : (
              <ul className="space-y-1.5">
                {falling.slice(0, 6).map((r) => (
                  <li key={r.entry.playerId} className="flex items-center gap-2 text-sm">
                    <PosBadge pos={r.analysis.player.position} />
                    <span className="min-w-0 flex-1 truncate">{r.analysis.player.name}</span>
                    <span className="num text-[12px] text-muted">{fmtCompact(r.value)}</span>
                    <Delta pct={r.analysis.trend.pct3 ?? r.analysis.trend.pct1} size="xs" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section eyebrow="Disponibilidad" title={<span className="inline-flex items-center gap-2"><HeartPulse size={16} className="text-gold" /> Lesiones, sanciones y dudas</span>}>
            {health.length === 0 ? (
              <p className="text-sm text-muted">{s.squad.length ? "Sin incidencias conocidas en tu plantilla." : "Añade jugadores a tu plantilla."}</p>
            ) : (
              <ul className="space-y-2">
                {health.map((r) => (
                  <li key={r.entry.playerId} className="flex items-center gap-2 text-sm">
                    <PosBadge pos={r.analysis.player.position} />
                    <span className="min-w-0 flex-1 truncate">
                      {r.analysis.player.name}
                      {r.inLineup && <span className="ml-1.5 rounded bg-cyan/15 px-1 text-[10px] text-cyan">en tu once</span>}
                    </span>
                    <StatusBadge status={r.analysis.player.status} note={r.analysis.player.statusNote} />
                    <ProbBar p={r.analysis.pPlay} source={r.analysis.pPlaySource} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="panel flex flex-col gap-1.5 p-4">
            <div className="eyebrow mb-1">Frescura de los datos</div>
            <Freshness label="Precios y puntos" at={s.dataFreshness.marketUpdatedAt} />
            <Freshness label="Calendario" at={s.dataFreshness.fixturesUpdatedAt} staleHours={72} />
            <Freshness label="Alineaciones probables" at={s.dataFreshness.lineupsUpdatedAt} staleHours={12} />
            <span className="text-[11.5px] text-dim">{s.dataFreshness.snapshotDays} días de precios propios guardados · {s.dataFreshness.playerCount} jugadores</span>
          </div>
        </div>
      </div>
    </>
  );
}
