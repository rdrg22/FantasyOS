import { z } from "zod";
import { fetchJson, ProviderError } from "./http";
import { resolveTeamId } from "../domain/teams";
import { madridToIso } from "../domain/time";
import type { Fixture } from "../domain/types";

/**
 * Calendario y resultados de openfootball/football.json (dominio público, sin clave).
 * https://github.com/openfootball/football.json — se actualiza manualmente por voluntarios,
 * por lo que los resultados pueden llegar con retraso de horas o días.
 */

export function openfootballUrl(season: string) {
  return `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/es.1.json`;
}

const Score = z.union([
  z.object({ ft: z.tuple([z.number(), z.number()]).optional(), ht: z.tuple([z.number(), z.number()]).optional() }),
  z.array(z.number()),
]);

const Match = z.object({
  round: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{1,2}:\d{2}/).optional(),
  team1: z.string(),
  team2: z.string(),
  score: Score.optional(),
});

const Payload = z.object({ name: z.string().optional(), matches: z.array(z.unknown()) });

export function parseOpenfootball(json: unknown, season: string): { fixtures: Fixture[]; skipped: number; unknownTeams: string[] } {
  const parsed = Payload.safeParse(json);
  if (!parsed.success) throw new ProviderError("openfootball: formato inesperado.", "parse");
  const fixtures: Fixture[] = [];
  const unknown = new Set<string>();
  let skipped = 0;
  const now = new Date().toISOString();
  for (const raw of parsed.data.matches) {
    const r = Match.safeParse(raw);
    if (!r.success) { skipped++; continue; }
    const m = r.data;
    const md = Number(m.round.match(/(\d+)/)?.[1]);
    const homeId = resolveTeamId(m.team1);
    const awayId = resolveTeamId(m.team2);
    if (!homeId) unknown.add(m.team1);
    if (!awayId) unknown.add(m.team2);
    if (!md || !homeId || !awayId) { skipped++; continue; }
    // Solo se acepta como resultado el marcador final explícito ("ft").
    const ft = m.score && !Array.isArray(m.score) ? m.score.ft : undefined;
    fixtures.push({
      id: `${season}:${md}:${homeId}-${awayId}`,
      season,
      matchday: md,
      date: m.date,
      kickoff: m.time ? madridToIso(m.date, m.time.slice(0, 5)) : null,
      homeId,
      awayId,
      homeScore: ft ? ft[0] : null,
      awayScore: ft ? ft[1] : null,
      source: "openfootball",
      updatedAt: now,
    });
  }
  return { fixtures, skipped, unknownTeams: [...unknown] };
}

export async function fetchOpenfootball(season: string) {
  const json = await fetchJson(openfootballUrl(season));
  return parseOpenfootball(json, season);
}
