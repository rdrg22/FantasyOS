import { getRepo } from "@/lib/services/context";
import { buildState, tableView } from "@/lib/services/state";
import { isPlayed } from "@/lib/analytics/fixtures";
import { PageHeader, Section, TeamChip } from "@/components/ui";
import { LeagueResults, type MatchdayResults } from "@/components/league/LeagueResults";
import { CardsBoard, type CardRow } from "@/components/league/CardsBoard";
import { IdealEleven, type IdealElevenProps } from "@/components/league/IdealEleven";
import { idealEleven, type PointsEntry } from "@/lib/analytics/ideal";
import type { PitchSlot } from "@/components/Pitch";

export default async function LigaPage({ searchParams }: { searchParams: Promise<{ j?: string }> }) {
  const { repo, workspace } = await getRepo();
  const [s, fixtures, pointMds, sp] = await Promise.all([buildState(repo, workspace), repo.getFixtures(), repo.pointsMatchdays(), searchParams]);

  // Jornadas con su lista de partidos; por defecto se abre la última con algún resultado.
  const byMd = new Map<number, MatchdayResults["matches"]>();
  for (const f of fixtures) {
    const list = byMd.get(f.matchday) ?? [];
    list.push({ id: f.id, homeId: f.homeId, awayId: f.awayId, homeScore: f.homeScore, awayScore: f.awayScore, kickoff: f.kickoff, date: f.date });
    byMd.set(f.matchday, list);
  }
  const matchdays: MatchdayResults[] = [...byMd]
    .sort((a, b) => a[0] - b[0])
    .map(([matchday, matches]) => ({ matchday, matches: matches.sort((x, y) => (x.kickoff ?? x.date).localeCompare(y.kickoff ?? y.date)) }));
  const lastWithResult = [...fixtures].filter(isPlayed).reduce((m, f) => Math.max(m, f.matchday), 0);
  const initial = lastWithResult || s.calendar.next?.matchday || matchdays[0]?.matchday || 1;

  const mine = new Set(s.squad.map((r) => r.entry.playerId));
  const cards: CardRow[] = [...s.analyses.values()]
    .filter((a) => (a.player.yellowCards ?? 0) > 0 || (a.player.redCards ?? 0) > 0 || a.player.warned)
    .map((a) => ({
      id: a.player.id,
      name: a.player.name,
      teamId: a.player.teamId,
      position: a.player.position,
      yellow: a.player.yellowCards ?? 0,
      red: a.player.redCards ?? 0,
      warned: Boolean(a.player.warned),
      suspended: a.player.status === "sancionado",
      mine: mine.has(a.player.id),
    }));
  const table = tableView(s.calendar.table);

  // Once ideal: jornada pedida (?j=) o la última con puntos guardados.
  let ideal: IdealElevenProps | null = null;
  const wanted = Number(sp.j);
  const md = pointMds.includes(wanted) ? wanted : pointMds.at(-1);
  if (md != null) {
    const entries: (PointsEntry & { a: NonNullable<ReturnType<typeof s.analyses.get>> })[] = [];
    for (const r of await repo.getMatchdayPoints(md)) {
      const a = s.analyses.get(r.playerId);
      if (a) entries.push({ playerId: r.playerId, position: a.player.position, points: r.points, a });
    }
    const best = idealEleven(entries);
    if (best) {
      const byId = new Map(entries.map((e) => [e.playerId, e.a]));
      const slots: PitchSlot[] = best.slots.map((x) => {
        const a = byId.get(x.playerId)!;
        return {
          slot: x.slot,
          position: x.position,
          player: { id: a.player.id, name: a.player.shortName || a.player.name, teamId: a.player.teamId, position: a.player.position, xp: a.xp, pPlay: a.pPlay, status: a.player.status, score: x.points },
        };
      });
      const myBest = idealEleven(entries.filter((e) => mine.has(e.playerId)));
      const mdFixtures = fixtures.filter((f) => f.matchday === md);
      ideal = {
        matchday: md,
        matchdays: pointMds,
        inProgress: mdFixtures.some((f) => !isPlayed(f)),
        formation: best.formation,
        total: best.total,
        slots,
        mineSlots: best.slots.filter((x) => mine.has(x.playerId)).map((x) => x.slot),
        myBest: myBest ? { total: myBest.total, formation: myBest.formation } : null,
      };
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="LaLiga"
        title="Liga"
        subtitle="Resultados por jornada, once ideal, clasificación y tarjetas de los jugadores. Se actualiza solo varias veces al día."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <LeagueResults matchdays={matchdays} initial={initial} />
          {ideal ? (
            <IdealEleven {...ideal} />
          ) : (
            <Section title="Once ideal">
              <p className="py-4 text-center text-sm text-muted">Aún no hay puntos de ninguna jornada: se guardan al sincronizar los puntos tras cada jornada.</p>
            </Section>
          )}
        </div>
        <div className="space-y-6">
          <Section
            title="Clasificación"
            info="Calculada con los resultados disponibles. Puede ir algo por detrás de la oficial si la fuente aún no tiene algún resultado. Se usa para estimar la dificultad de cada rival."
          >
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
          </Section>
          <CardsBoard rows={cards} />
        </div>
      </div>
    </>
  );
}
