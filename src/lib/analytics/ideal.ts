import type { Fixture, Formation, Player, Position } from "../domain/types";
import { FORMATIONS } from "../domain/types";
import { formationCounts, formationSlots } from "../domain/formations";
import { isPlayed } from "./fixtures";

export interface PointsEntry {
  playerId: string;
  position: Position;
  points: number;
}

export interface IdealEleven {
  formation: Formation;
  total: number;
  slots: { slot: string; position: Position; playerId: string; points: number }[];
}

/**
 * Mejor once posible con unos puntos dados: prueba cada formación permitida y se queda
 * con la que más suma (el reparto óptimo por línea es independiente). Sin entrenador.
 * Devuelve null si no hay jugadores suficientes para ninguna formación.
 */
export function idealEleven(entries: PointsEntry[]): IdealEleven | null {
  const byPos = new Map<Position, PointsEntry[]>();
  for (const e of entries) {
    if (e.position === "ENT") continue;
    const list = byPos.get(e.position) ?? [];
    list.push(e);
    byPos.set(e.position, list);
  }
  for (const list of byPos.values()) list.sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));

  let best: IdealEleven | null = null;
  for (const f of FORMATIONS) {
    const counts: Record<string, number> = { POR: 1, ...formationCounts(f) };
    if (Object.entries(counts).some(([pos, n]) => (byPos.get(pos as Position)?.length ?? 0) < n)) continue;
    const used: Record<string, number> = {};
    const slots = formationSlots(f, false).map((s) => {
      const e = byPos.get(s.position)![(used[s.position] = (used[s.position] ?? -1) + 1)];
      return { slot: s.slot, position: s.position, playerId: e.playerId, points: e.points };
    });
    const total = slots.reduce((sum, s) => sum + s.points, 0);
    if (!best || total > best.total) best = { formation: f, total, slots };
  }
  return best;
}

/**
 * Qué puntos de «última jornada» de la fuente se pueden atribuir con seguridad a una jornada.
 * Se toma la jornada más reciente con algún partido jugado y solo los jugadores cuyo equipo ya
 * la ha jugado: los demás aún muestran los puntos de la jornada anterior.
 */
export function attributableMatchdayPoints(
  players: Pick<Player, "id" | "teamId" | "lastPoints">[],
  fixtures: Fixture[],
): { matchday: number; rows: { playerId: string; points: number }[]; complete: boolean } | null {
  const played = fixtures.filter(isPlayed);
  if (played.length === 0) return null;
  const matchday = Math.max(...played.map((f) => f.matchday));
  const mdFixtures = fixtures.filter((f) => f.matchday === matchday);
  const teams = new Set(mdFixtures.filter(isPlayed).flatMap((f) => [f.homeId, f.awayId]));
  const rows = players
    .filter((p) => p.teamId && teams.has(p.teamId) && p.lastPoints != null)
    .map((p) => ({ playerId: p.id, points: p.lastPoints as number }));
  return { matchday, rows, complete: mdFixtures.every(isPlayed) };
}
