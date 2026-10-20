import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, CheckCircle2, Coins, Wallet, Zap } from "lucide-react";
import { getRepo } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";
import { topDecisions } from "@/lib/analytics/recommendations";
import { fmtCompact, fmtMoney, fmtPct, fmtSigned } from "@/lib/domain/money";
import { fmtDateTime, fmtDate, madridToIso } from "@/lib/domain/time";
import { getTeam } from "@/lib/domain/teams";
import { STATUS_LABEL } from "@/lib/domain/types";
import { Empty, Kpi, PageHeader, PosBadge, Section } from "@/components/ui";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Countdown } from "@/components/Countdown";
import { SyncButton } from "@/components/SyncButton";

export default async function Dashboard() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  const actionable = s.recommendations.filter((r) => r.action !== "MANTENER");
  const top3 = topDecisions(s.recommendations, 3);
  const teamOf = (id: string | null) => (id ? s.analyses.get(id)?.player.teamId ?? null : null);
  const ownIds = new Set(s.squad.map((r) => r.entry.playerId));
  const totalPnl = s.squad.reduce((a, r) => a + r.pnl.diff, 0);
  const next = s.calendar.next;
  const isEmpty = s.squad.length === 0 && s.dataFreshness.playerCount === 0;

  // Una sola lista de alertas: disponibilidad (lesión, sanción, duda, poca titularidad) y caídas de valor.
  const alerts = s.squad
    .map((r) => {
      const a = r.analysis;
      const tags: { text: string; tone: "down" | "gold" }[] = [];
      if (a.player.status === "lesionado" || a.player.status === "sancionado") tags.push({ text: STATUS_LABEL[a.player.status], tone: "down" });
      else if (a.player.status === "duda") tags.push({ text: "Duda", tone: "gold" });
      else if (a.pPlaySource !== "supuesto" && a.pPlay < 0.5) tags.push({ text: `${Math.round(a.pPlay * 100)}% juega`, tone: "gold" });
      if (a.player.warned && a.player.status !== "sancionado") tags.push({ text: "Apercibido", tone: "gold" });
      const drop = a.trend.pct3 ?? a.trend.pct1;
      if (a.trend.direction === "baja" || (a.trend.pct1 ?? 0) < -1) tags.push({ text: `${fmtPct(drop)} valor`, tone: "down" });
      return { r, tags, severity: tags.filter((t) => t.tone === "down").length * 2 + tags.length + (r.inLineup ? 1 : 0) };
    })
    .filter((x) => x.tags.length > 0)
    .sort((x, y) => y.severity - x.severity);

  return (
    <>
      <PageHeader
        eyebrow={`${fmtDate(s.today)} · ${workspace === "demo" ? "demostración" : "mis datos"}`}
        title="Qué debería hacer hoy"
        subtitle="Decisiones priorizadas según tu plantilla, tu presupuesto, el mercado y la próxima jornada. Son estimaciones, no certezas: abre cada una para ver motivos y riesgos."
        actions={workspace === "real" && <SyncButton kind="all" label="Actualizar datos" />}
      />

      {isEmpty && (
        <div className="panel mb-6 p-6">
          <Empty title="Empieza por cargar datos" icon={<Zap size={22} />}>
            Pulsa «Actualizar datos» y añade tus jugadores en <Link href="/plantilla" className="text-cyan underline">Mi equipo</Link>. Para probar, cambia a <b>Demo</b>.
          </Empty>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Wallet size={13} />}
          label="Saldo"
          value={<span title={fmtMoney(s.settings.budget)}>{Math.abs(s.settings.budget) >= 1e8 ? fmtCompact(s.settings.budget) + " €" : fmtMoney(s.settings.budget)}</span>}
          tone={s.settings.budget < 0 ? "down" : "up"}
          sub={s.settings.budget < 0 ? "¡negativo: no puntuarías!" : undefined}
        />
        <Kpi icon={<Coins size={13} />} label="Valor de la plantilla" value={<span title={fmtMoney(s.squadValue)}>{fmtCompact(s.squadValue)} €</span>} tone="cyan" sub={`${s.squad.length} jugadores`} />
        <Kpi label="Ganancia / pérdida" value={fmtSigned(totalPnl)} tone={totalPnl >= 0 ? "up" : "down"} sub="frente a lo que pagaste" />
        <div className="panel-inset px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <CalendarClock size={13} /> {next ? `Jornada ${next.matchday}` : "Próxima jornada"}
          </div>
          {next ? (
            <>
              <div className="num mt-1 font-display text-[22px] font-semibold leading-tight text-gold">
                {next.firstKickoff ? <Countdown to={next.firstKickoff} /> : next.firstDate ? <>≈ <Countdown to={madridToIso(next.firstDate, "18:00")} /></> : "—"}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-dim">{next.firstKickoff ? fmtDateTime(next.firstKickoff) : `${fmtDate(next.firstDate)} · hora por confirmar`}</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-muted">Sin calendario</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Section
          title="Tus 3 decisiones clave"
          actions={
            actionable.length > 3 && (
              <Link href="/recomendaciones" className="inline-flex items-center gap-1 text-sm text-cyan hover:underline">
                Ver todas ({actionable.length}) <ArrowRight size={14} />
              </Link>
            )
          }
        >
          {top3.length === 0 ? (
            <Empty title="Nada urgente hoy">Sin movimientos claros con los datos actuales.</Empty>
          ) : (
            <div className="space-y-2.5">
              {top3.map((r, i) => (
                <RecommendationCard key={r.id} rec={r} rank={i + 1} teamId={teamOf(r.playerId)} ownsPlayer={!!r.playerId && ownIds.has(r.playerId)} upcoming={r.playerId ? s.analyses.get(r.playerId)?.upcoming : undefined} />
              ))}
            </div>
          )}
          {s.calendar.pending.length > 0 && (
            <p className="mt-4 text-[12px] text-muted">
              Pendiente antes de la J{next?.matchday ?? "?"}: {s.calendar.pending.map((f) => `${getTeam(f.homeId)?.name}–${getTeam(f.awayId)?.name}`).join(" · ")}
            </p>
          )}
        </Section>

        <Section title={<span className="inline-flex items-center gap-2"><BellRing size={16} className="text-gold" /> Alertas de tu equipo</span>}>
          {s.squad.length === 0 ? (
            <p className="text-sm text-muted">Añade tus jugadores para ver alertas.</p>
          ) : alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={15} className="text-up" /> Todo en orden.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 8).map(({ r, tags }) => (
                <li key={r.entry.playerId} className="flex items-center gap-2 text-sm">
                  <PosBadge pos={r.analysis.player.position} />
                  <span className="min-w-0 flex-1 truncate">
                    {r.analysis.player.name}
                    {r.inLineup && <span className="ml-1.5 rounded bg-cyan/15 px-1 text-[10px] text-cyan">XI</span>}
                  </span>
                  {tags.map((t) => (
                    <span key={t.text} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${t.tone === "down" ? "bg-down/12 text-down" : "bg-gold/12 text-gold"}`}>
                      {t.text}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
