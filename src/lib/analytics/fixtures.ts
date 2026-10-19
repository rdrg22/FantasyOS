import type { Fixture } from "../domain/types";
import { TEAMS } from "../domain/teams";

export interface TeamForm {
  teamId: string;
  played: number;
  points: number;
  gf: number;
  ga: number;
  ppg: number;
  /** Puesto en la clasificación calculada */
  rank: number;
}

export interface MatchdayInfo {
  matchday: number;
  fixtures: Fixture[];
  firstKickoff: string | null;
  firstDate: string | null;
  allTimesKnown: boolean;
  finished: number;
}

export interface CalendarState {
  current: MatchdayInfo | null; // jornada en juego (empezada y no terminada)
  next: MatchdayInfo | null; // próxima jornada a preparar
  /** Partidos por jugar de jornadas ya empezadas (en curso o aplazados) */
  pending: Fixture[];
  table: Map<string, TeamForm>;
  leagueAvgPpg: number;
}

export function isPlayed(f: Fixture): boolean {
  return f.homeScore != null && f.awayScore != null;
}

export function buildTable(fixtures: Fixture[]): Map<string, TeamForm> {
  const t = new Map<string, TeamForm>();
  for (const team of TEAMS) t.set(team.id, { teamId: team.id, played: 0, points: 0, gf: 0, ga: 0, ppg: 0, rank: 0 });
  for (const f of fixtures) {
    if (!isPlayed(f)) continue;
    const h = t.get(f.homeId);
    const a = t.get(f.awayId);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += f.homeScore!; h.ga += f.awayScore!;
    a.gf += f.awayScore!; a.ga += f.homeScore!;
    if (f.homeScore! > f.awayScore!) h.points += 3;
    else if (f.homeScore! < f.awayScore!) a.points += 3;
    else { h.points++; a.points++; }
  }
  const arr = [...t.values()];
  for (const x of arr) x.ppg = x.played ? x.points / x.played : 0;
  arr.sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  arr.forEach((x, i) => (x.rank = i + 1));
  return t;
}

function mdInfo(matchday: number, fx: Fixture[]): MatchdayInfo {
  const sorted = [...fx].sort((a, b) => (a.kickoff ?? a.date).localeCompare(b.kickoff ?? b.date));
  return {
    matchday,
    fixtures: sorted,
    firstKickoff: sorted.find((f) => f.kickoff)?.kickoff ?? null,
    firstDate: sorted[0]?.date ?? null,
    allTimesKnown: sorted.every((f) => f.kickoff),
    finished: sorted.filter(isPlayed).length,
  };
}

export function calendarState(fixtures: Fixture[], now = new Date()): CalendarState {
  const byMd = new Map<number, Fixture[]>();
  for (const f of fixtures) {
    const arr = byMd.get(f.matchday);
    if (arr) arr.push(f);
    else byMd.set(f.matchday, [f]);
  }
  const mds = [...byMd.keys()].sort((a, b) => a - b);
  const nowIso = now.toISOString();
  const todayStr = nowIso.slice(0, 10);
  let current: MatchdayInfo | null = null;
  let next: MatchdayInfo | null = null;
  const pending: Fixture[] = [];
  for (const md of mds) {
    const info = mdInfo(md, byMd.get(md)!);
    const started = info.fixtures.some((f) => isPlayed(f) || (f.kickoff ? f.kickoff <= nowIso : f.date < todayStr));
    if (!started) { next = info; break; }
    // Partidos aún por jugar de jornadas ya empezadas (en curso o aplazados).
    const open = info.fixtures.filter((f) => !isPlayed(f) && f.date >= todayStr);
    if (open.length) {
      pending.push(...open);
      current = info; // la última jornada empezada con partidos pendientes
    }
  }
  const table = buildTable(fixtures);
  const played = [...table.values()].filter((x) => x.played > 0);
  const leagueAvgPpg = played.length ? played.reduce((a, x) => a + x.ppg, 0) / played.length : 1.35;
  return { current, next, pending, table, leagueAvgPpg };
}

/** Dificultad del rival 1 (fácil) .. 5 (muy difícil), según puntos por partido. */
export function opponentDifficulty(opponentId: string | null, table: Map<string, TeamForm>): number | null {
  if (!opponentId) return null;
  const o = table.get(opponentId);
  if (!o || o.played < 2) return null;
  if (o.ppg >= 2.1) return 5;
  if (o.ppg >= 1.7) return 4;
  if (o.ppg >= 1.2) return 3;
  if (o.ppg >= 0.8) return 2;
  return 1;
}

/** Multiplicador sobre los puntos esperados según rival y localía (0.8..1.2). */
export function fixtureFactor(opponentId: string | null, home: boolean | null, table: Map<string, TeamForm>, avg: number): number {
  let f = 1;
  const o = opponentId ? table.get(opponentId) : undefined;
  if (o && o.played >= 2 && avg > 0) f += 0.2 * ((avg - o.ppg) / avg);
  if (home === true) f += 0.04;
  if (home === false) f -= 0.04;
  return Math.max(0.8, Math.min(1.2, f));
}

/** Rival y localía de un equipo en una jornada concreta. */
export function opponentIn(teamId: string | null, md: MatchdayInfo | null): { opponentId: string; home: boolean; fixture: Fixture } | null {
  if (!teamId || !md) return null;
  for (const f of md.fixtures) {
    if (f.homeId === teamId) return { opponentId: f.awayId, home: true, fixture: f };
    if (f.awayId === teamId) return { opponentId: f.homeId, home: false, fixture: f };
  }
  return null;
}
