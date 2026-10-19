import { z } from "zod";
import { decodeEntities, ProviderError } from "../http";
import { teamByFfId, resolveTeamId } from "../../domain/teams";
import { normalizeName, parsePosition } from "../../domain/normalize";
import type { SourceHistory } from "../../domain/types";

/**
 * Parser de https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado
 *
 * La página se sirve renderizada en el servidor. Cada jugador es un <tr class="elemento_jugador">
 * con atributos data-* (valor actual y de hace 1/2/3/7/14/30 mercados, tendencia, aceleración).
 * No es una API documentada: si cambia el marcado, el parser falla de forma controlada.
 */

export const FF_MARKET_URL = "https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado";
export const FF_POINTS_URL = "https://www.futbolfantasy.com/analytics/laliga-fantasy/puntos";

const intStr = z.string().regex(/^-?\d+$/).transform(Number);
const optInt = z.string().regex(/^-?\d+$/).transform(Number).optional();

const MarketRow = z.object({
  id: z.string().regex(/^e?\d+$/),
  nombre: z.string().min(2),
  posicion: z.string(),
  equipo: z.string().regex(/^\d+$/).transform(Number),
  valor: intStr.pipe(z.number().int().positive()),
  valor1: optInt,
  valor2: optInt,
  valor3: optInt,
  valor7: optInt,
  valor14: optInt,
  valor30: optInt,
  tendencia: optInt,
  aceleracion: optInt,
});

export interface FfMarketPlayer {
  ffId: string;
  name: string;
  shortName: string | null;
  normName: string;
  teamId: string;
  position: NonNullable<ReturnType<typeof parsePosition>>;
  value: number;
  history: SourceHistory;
  streakDays: number | null;
  acceleration: number | null;
  startProb: number | null;
  nextOpponentId: string | null;
  nextHome: boolean | null;
  nextMatchday: number | null;
}

export interface FfMarketResult {
  players: FfMarketPlayer[];
  skipped: number;
  sourceUpdatedAt: string | null;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/data-([a-z0-9-]+)="([^"]*)"/g)) out[m[1]] = decodeEntities(m[2]);
  return out;
}

/** "19/10/2026 04:06" (hora de Madrid) -> ISO aproximado; se guarda también el texto original. */
export function parseFfTimestamp(html: string): string | null {
  const m = html.match(/Última actualización:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;
}

export function parseFfMarket(html: string): FfMarketResult {
  const chunks = html.split(/<tr class="elemento_jugador/).slice(1);
  if (chunks.length === 0) throw new ProviderError("FútbolFantasy: no se encontraron filas de jugadores. Puede que la página haya cambiado.", "parse");
  const players: FfMarketPlayer[] = [];
  let skipped = 0;
  for (const chunk of chunks) {
    const row = chunk.split("</tr>")[0];
    const openTag = row.slice(0, row.indexOf(">") + 1);
    const parsed = MarketRow.safeParse(attrs(openTag));
    if (!parsed.success) { skipped++; continue; }
    const d = parsed.data;
    const team = teamByFfId(d.equipo);
    const position = parsePosition(d.posicion);
    if (!team || !position) { skipped++; continue; } // filiales u otros equipos

    const full = row.match(/class="player-name"><span class="d-none d-md-inline">([^<]+)<\/span><span class="d-inline d-md-none">([^<]+)<\/span>/);
    const name = full ? decodeEntities(full[1]).trim() : d.nombre.replace(/\b\w/g, (c) => c.toUpperCase());
    const shortName = full ? decodeEntities(full[2]).trim() : null;

    const rival = row.match(/title="Jornada (\d+) · Próximo rival: ([^"(]+?)\s*\((Casa|Fuera)\)"/);
    const prob = row.match(/class="prob-\d"[^>]*>(\d{1,3})%</);

    players.push({
      ffId: d.id,
      name,
      shortName,
      normName: normalizeName(name),
      teamId: team.id,
      position,
      value: d.valor,
      history: {
        d1: d.valor1 ?? null,
        d2: d.valor2 ?? null,
        d3: d.valor3 ?? null,
        d7: d.valor7 ?? null,
        d14: d.valor14 ?? null,
        d30: d.valor30 ?? null,
      },
      streakDays: d.tendencia ?? null,
      acceleration: d.aceleracion ?? null,
      startProb: prob ? Math.min(100, Number(prob[1])) / 100 : null,
      nextOpponentId: rival ? resolveTeamId(decodeEntities(rival[2])) : null,
      nextHome: rival ? rival[3] === "Casa" : null,
      nextMatchday: rival ? Number(rival[1]) : null,
    });
  }
  if (players.length < 50) {
    throw new ProviderError(`FútbolFantasy: solo se pudieron leer ${players.length} jugadores (${skipped} descartados). La estructura de la página puede haber cambiado.`, "parse");
  }
  return { players, skipped, sourceUpdatedAt: parseFfTimestamp(html) };
}

// ───────────────────────── Puntos ─────────────────────────

const PointsRow = z.object({
  nombre: z.string(),
  equipo: z.string().regex(/^\d+$/).transform(Number),
  puntostemporada: intStr,
  puntos1: optInt,
  puntos5: optInt,
  mediatemporada: z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number),
  temporada: intStr, // partidos jugados en la temporada
  jugados5: optInt,
});

export interface FfPointsRow {
  ffId: string;
  normName: string;
  teamId: string | null;
  pointsTotal: number;
  pointsAvg: number;
  matchesPlayed: number;
  lastPoints: number | null;
  points5: number | null;
  played5: number | null;
}

export function parseFfPoints(html: string): { rows: FfPointsRow[]; skipped: number } {
  const chunks = html.split(/<tr class="elemento_jugador/).slice(1);
  const rows: FfPointsRow[] = [];
  let skipped = 0;
  for (const chunk of chunks) {
    const openTag = chunk.slice(0, chunk.indexOf(">") + 1);
    const idm = openTag.match(/openPlayerPointsStats\((e?\d+|'e?\d+')/);
    const parsed = PointsRow.safeParse(attrs(openTag));
    if (!idm || !parsed.success) { skipped++; continue; }
    const d = parsed.data;
    rows.push({
      ffId: idm[1].replace(/'/g, ""),
      normName: normalizeName(d.nombre),
      teamId: teamByFfId(d.equipo)?.id ?? null,
      pointsTotal: d.puntostemporada,
      pointsAvg: d.mediatemporada,
      matchesPlayed: d.temporada,
      lastPoints: d.puntos1 ?? null,
      points5: d.puntos5 ?? null,
      played5: d.jugados5 ?? null,
    });
  }
  if (chunks.length > 0 && rows.length === 0) throw new ProviderError("FútbolFantasy (puntos): no se pudo interpretar ninguna fila.", "parse");
  return { rows, skipped };
}
