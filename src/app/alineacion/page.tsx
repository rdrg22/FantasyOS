import { getRepo } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";
import { getTeam } from "@/lib/domain/teams";
import { fmtDateTime } from "@/lib/domain/time";
import { Empty, Kpi, PageHeader, PosBadge, Section, TeamChip } from "@/components/ui";
import { FormationBars } from "@/components/charts";
import { LineupBoard } from "@/components/LineupBoard";
import type { PitchSlot } from "@/components/Pitch";
import { POSITION_LABEL, type Position } from "@/lib/domain/types";

export default async function AlineacionPage() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  const rec = s.lineupRec;
  const cmp = s.lineupCmp;
  const A = (id: string | null) => (id ? s.analyses.get(id) : undefined);
  const md = s.calendar.next;

  const recSlots: PitchSlot[] = rec.slots.map((sl) => {
    const a = A(sl.playerId);
    return {
      slot: sl.slot,
      position: sl.position,
      player: a ? { id: a.player.id, name: a.player.shortName ?? a.player.name, teamId: a.player.teamId, position: a.player.position, xp: a.xp, pPlay: a.pPlay, status: a.player.status, sub: a.opponentId ? `${a.home ? "vs" : "@"} ${getTeam(a.opponentId)?.short ?? ""}` : undefined } : null,
      // Cada hueco muestra una alternativa distinta de su línea (la n-ésima mejor del banquillo).
      alternatives: rec.bench[sl.position].filter((b) => b.xp > 0).slice(Number(sl.slot.split("-")[1]) - 1, Number(sl.slot.split("-")[1])).map((b) => {
        const x = A(b.playerId)!;
        return { id: x.player.id, name: x.player.shortName ?? x.player.name, teamId: x.player.teamId, position: x.player.position, xp: x.xp, pPlay: x.pPlay, status: x.player.status };
      }),
    };
  });
  const curSlots: PitchSlot[] = Object.entries(s.settings.lineup).map(([slot, pid]) => {
    const a = A(pid);
    const issue = cmp.issues.find((i) => i.slot === slot);
    return {
      slot,
      position: slot.split("-")[0] as Position,
      player: a ? { id: a.player.id, name: a.player.shortName ?? a.player.name, teamId: a.player.teamId, position: a.player.position, xp: a.xp, pPlay: a.pPlay, status: a.player.status, alert: issue?.message ?? null } : null,
    };
  });
  const changedSlots = new Set(rec.slots.filter((sl) => sl.playerId && !Object.values(s.settings.lineup).includes(sl.playerId)).map((sl) => sl.slot));

  return (
    <>
      <PageHeader
        eyebrow={md ? `Jornada ${md.matchday} · ${md.firstKickoff ? `cierre aprox. ${fmtDateTime(md.firstKickoff)}` : "horario por confirmar"}` : "Próxima jornada"}
        title="Mi once"
        subtitle="El once que maximiza los puntos esperados con tu plantilla. Se basa en alineaciones PROBABLES y estimaciones: no es una alineación oficial confirmada."
      />
      {s.squad.length === 0 ? (
        <Empty title="Sin plantilla">Añade tus jugadores en «Mi equipo» para calcular el once recomendado.</Empty>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Formación recomendada" value={rec.formation} tone="cyan" />
            <Kpi label="Puntos esperados (recomendado)" value={rec.total.toFixed(1)} tone="gold" />
            <Kpi label="Puntos esperados (tu once)" value={cmp.currentTotal.toFixed(1)} sub={`Formación guardada: ${s.settings.formation}`} />
            <Kpi label="Diferencia" value={`${cmp.delta >= 0 ? "+" : ""}${cmp.delta.toFixed(1)} pts`} tone={cmp.delta > 0.5 ? "up" : "fg"} sub={cmp.issues.length ? `${cmp.issues.length} avisos en tu once` : "sin avisos"} />
          </div>

          <LineupBoard recSlots={recSlots} curSlots={curSlots} changedSlots={[...changedSlots]} delta={cmp.delta} />

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Section eyebrow="Por qué cada jugador" title="Razones del once" className="xl:col-span-2">
              <ul className="divide-y divide-line/70">
                {rec.slots.map((sl) => {
                  const a = A(sl.playerId);
                  return (
                    <li key={sl.slot} className="flex flex-wrap items-start gap-3 py-2">
                      <PosBadge pos={sl.position} />
                      <div className="min-w-[160px]">
                        <div className="font-medium">{a?.player.name ?? "— sin jugador —"}</div>
                        {a && <TeamChip teamId={a.player.teamId} short />}
                      </div>
                      <div className="flex-1 text-[12.5px] text-muted">{sl.reasons.join(" · ")}</div>
                      <span className="num font-semibold text-gold">{sl.xp.toFixed(1)}</span>
                    </li>
                  );
                })}
              </ul>
            </Section>
            <div className="space-y-6">
              <Section eyebrow="Comparativa" title="Formaciones posibles" info="Puntos esperados de tu mejor once en cada formación. En rojo, las que no puedes completar con tu plantilla.">
                <FormationBars data={rec.options} best={rec.formation} />
              </Section>
              <Section eyebrow="Banquillo" title="Alternativas por línea">
                {(Object.keys(rec.bench) as Position[]).filter((p) => rec.bench[p].length).map((pos) => (
                  <div key={pos} className="mb-2">
                    <div className="eyebrow mb-1">{POSITION_LABEL[pos]}</div>
                    <ul className="space-y-1">
                      {rec.bench[pos].slice(0, 4).map((b) => (
                        <li key={b.playerId} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="truncate">{A(b.playerId)?.player.name}</span>
                          <span className="truncate text-[11.5px] text-dim">{b.why}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
