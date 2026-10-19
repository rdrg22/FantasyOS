import { getRepo } from "@/lib/services/context";
import { buildState, tableView } from "@/lib/services/state";
import { getTeam } from "@/lib/domain/teams";
import { fmtDate, fmtDateTime } from "@/lib/domain/time";
import { Empty, Freshness, PageHeader, PosBadge, ProbBar, Section, StatusBadge, TeamChip } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { MatchCard, type TeamRoster } from "@/components/MatchCard";
import type { ProbableLineupEntry } from "@/lib/domain/types";

export default async function JornadaPage() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  const md = s.calendar.next;
  const lineups = md ? await repo.getLineups(md.matchday) : [];
  const byTeam = new Map<string, ProbableLineupEntry[]>();
  for (const l of lineups) (byTeam.get(l.teamId) ?? byTeam.set(l.teamId, []).get(l.teamId)!).push(l);
  const mine = new Set(s.squad.map((r) => r.entry.playerId));
  const roster = (teamId: string): TeamRoster => ({
    teamId,
    entries: (byTeam.get(teamId) ?? []).map((e) => ({ ...e, mine: e.playerId ? mine.has(e.playerId) : false })),
    players: [...s.analyses.values()].filter((a) => a.player.teamId === teamId && a.player.position !== "ENT").map((a) => ({ id: a.player.id, name: a.player.name, position: a.player.position })),
  });
  const table = tableView(s.calendar.table);
  const myPlayers = s.squad.map((r) => r.analysis).sort((a, b) => a.pPlay - b.pPlay);

  return (
    <>
      <PageHeader
        eyebrow={md ? `Jornada ${md.matchday}` : "Calendario"}
        title="Próxima jornada"
        subtitle="Partidos, alineaciones probables, lesionados y sancionados. Las alineaciones son PROBABLES (estimaciones de la fuente o tuyas), nunca oficiales hasta que se publican antes del partido."
        actions={
          <>
            <Freshness label="Alineaciones" at={s.dataFreshness.lineupsUpdatedAt} staleHours={12} />
            {workspace === "real" && <SyncButton kind="lineups" label="Actualizar alineaciones" />}
            {workspace === "real" && <SyncButton kind="fixtures" label="Calendario" ghost />}
          </>
        }
      />

      {!md ? (
        <Empty title="Sin calendario">Sincroniza el calendario en «Datos y fuentes» para ver la próxima jornada.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
              <span>Primer partido: <b className="text-fg">{md.firstKickoff ? fmtDateTime(md.firstKickoff) : `${fmtDate(md.firstDate)} (hora por confirmar)`}</b></span>
              {!md.allTimesKnown && <span className="text-gold">Algunos horarios aún no están publicados.</span>}
            </div>
            {md.fixtures.map((f) => (
              <MatchCard
                key={f.id}
                matchday={md.matchday}
                kickoff={f.kickoff}
                date={f.date}
                home={roster(f.homeId)}
                away={roster(f.awayId)}
                homeRank={s.calendar.table.get(f.homeId)?.rank ?? null}
                awayRank={s.calendar.table.get(f.awayId)?.rank ?? null}
              />
            ))}
          </div>

          <div className="space-y-6">
            <Section eyebrow="Revisión automática" title="Tus jugadores en esta jornada">
              {myPlayers.length === 0 ? (
                <p className="text-sm text-muted">Añade tu plantilla para ver avisos.</p>
              ) : (
                <ul className="space-y-1.5">
                  {myPlayers.map((a) => (
                    <li key={a.player.id} className="flex items-center gap-2 text-[13px]">
                      <PosBadge pos={a.player.position} />
                      <span className="min-w-0 flex-1 truncate">
                        {a.player.name}
                        {a.noMatch && <span className="ml-1 text-[11px] text-down">sin partido</span>}
                        {a.lineupRole && <span className="ml-1 text-[11px] text-dim">({a.lineupRole})</span>}
                      </span>
                      <StatusBadge status={a.player.status} />
                      <ProbBar p={a.pPlaySource === "supuesto" ? null : a.pPlay} source={a.pPlaySource} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {s.calendar.pending.length > 0 && (
              <Section eyebrow="Pendientes" title="Partidos aplazados o en curso">
                <ul className="space-y-1 text-[12.5px]">
                  {s.calendar.pending.map((f) => (
                    <li key={f.id} className="flex justify-between gap-2">
                      <span>{getTeam(f.homeId)?.name} – {getTeam(f.awayId)?.name}</span>
                      <span className="text-muted">J{f.matchday} · {f.kickoff ? fmtDateTime(f.kickoff) : fmtDate(f.date)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section eyebrow={`Calculada con ${table.reduce((a, t) => a + t.played, 0) / 2} resultados`} title="Clasificación">
              <table className="table-compact w-full">
                <thead>
                  <tr><th>#</th><th>Equipo</th><th className="!text-right">PJ</th><th className="!text-right">DG</th><th className="!text-right">Pts</th></tr>
                </thead>
                <tbody>
                  {table.map((t) => (
                    <tr key={t.teamId}>
                      <td className="num text-muted">{t.rank}</td>
                      <td><TeamChip teamId={t.teamId} /></td>
                      <td className="num text-right text-muted">{t.played}</td>
                      <td className="num text-right text-muted">{t.gf - t.ga > 0 ? "+" : ""}{t.gf - t.ga}</td>
                      <td className="num text-right font-semibold">{t.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-dim">Solo cuenta los resultados disponibles en la fuente del calendario; puede ir con retraso respecto a la clasificación oficial. Se usa para estimar la dificultad del rival.</p>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
