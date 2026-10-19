import { z } from "zod";
import { fetchJson, ProviderError } from "./http";
import { resolveTeamId } from "../domain/teams";
import type { Fixture } from "../domain/types";

/**
 * football-data.org v4 (opcional). Requiere FOOTBALL_DATA_API_KEY (plan gratuito: 10 peticiones/min).
 * Endpoint: GET https://api.football-data.org/v4/competitions/PD/matches?season=YYYY
 * La clave solo se usa en el servidor.
 */

const Team = z.object({ name: z.string().nullable(), shortName: z.string().nullable().optional() });
const Match = z.object({
  id: z.number(),
  utcDate: z.string(),
  status: z.string(),
  matchday: z.number().nullable(),
  homeTeam: Team,
  awayTeam: Team,
  score: z.object({ fullTime: z.object({ home: z.number().nullable(), away: z.number().nullable() }) }),
});
const Payload = z.object({ matches: z.array(z.unknown()) });

export function footballDataEnabled() {
  return Boolean(process.env.FOOTBALL_DATA_API_KEY);
}

export function parseFootballData(json: unknown, season: string): { fixtures: Fixture[]; skipped: number } {
  const p = Payload.safeParse(json);
  if (!p.success) throw new ProviderError("football-data.org: formato inesperado.", "parse");
  const fixtures: Fixture[] = [];
  let skipped = 0;
  const now = new Date().toISOString();
  for (const raw of p.data.matches) {
    const r = Match.safeParse(raw);
    if (!r.success || r.data.matchday == null) { skipped++; continue; }
    const m = r.data;
    const homeId = resolveTeamId(m.homeTeam.name) ?? resolveTeamId(m.homeTeam.shortName);
    const awayId = resolveTeamId(m.awayTeam.name) ?? resolveTeamId(m.awayTeam.shortName);
    if (!homeId || !awayId) { skipped++; continue; }
    const finished = m.status === "FINISHED";
    fixtures.push({
      id: `${season}:${m.matchday}:${homeId}-${awayId}`,
      season,
      matchday: m.matchday!,
      date: new Date(m.utcDate).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }),
      kickoff: m.status === "TIMED" || m.status === "SCHEDULED" || finished || m.status === "IN_PLAY" ? m.utcDate : null,
      homeId,
      awayId,
      homeScore: finished ? m.score.fullTime.home : null,
      awayScore: finished ? m.score.fullTime.away : null,
      source: "football-data",
      updatedAt: now,
    });
  }
  return { fixtures, skipped };
}

export async function fetchFootballData(season: string) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new ProviderError("FOOTBALL_DATA_API_KEY no configurada.", "disabled");
  const year = season.slice(0, 4);
  const json = await fetchJson(`https://api.football-data.org/v4/competitions/PD/matches?season=${year}`, { headers: { "X-Auth-Token": key } });
  return parseFootballData(json, season);
}
