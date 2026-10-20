import { getRepo } from "@/lib/services/context";
import { buildState, tableView } from "@/lib/services/state";
import { isPlayed } from "@/lib/analytics/fixtures";
import { PageHeader, Section, TeamChip } from "@/components/ui";
import { LeagueResults, type MatchdayResults } from "@/components/league/LeagueResults";
import { CardsBoard, type CardRow } from "@/components/league/CardsBoard";

export default async function LigaPage() {
  const { repo, workspace } = await getRepo();
  const [s, fixtures] = await Promise.all([buildState(repo, workspace), repo.getFixtures()]);

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

  return (
    <>
      <PageHeader
        eyebrow="LaLiga"
        title="Liga"
        subtitle="Resultados por jornada, clasificación y tarjetas de los jugadores. Se actualiza solo varias veces al día."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <LeagueResults matchdays={matchdays} initial={initial} />
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
        </div>
        <CardsBoard rows={cards} />
      </div>
    </>
  );
}
