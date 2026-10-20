import { describe, expect, it } from "vitest";
import { attributableMatchdayPoints, idealEleven, type PointsEntry } from "@/lib/analytics/ideal";
import type { Fixture, Position } from "@/lib/domain/types";

const fx = (md: number, h: string, a: string, score?: [number, number]): Fixture => ({
  id: `${md}-${h}-${a}`, season: "2026-27", matchday: md, kickoff: null, date: "2026-10-18", homeId: h, awayId: a,
  homeScore: score?.[0] ?? null, awayScore: score?.[1] ?? null, source: "demo", updatedAt: "2026-10-18T00:00:00Z",
});

describe("once ideal", () => {
  it("elige la formación que más suma con los mejores de cada línea", () => {
    const e: PointsEntry[] = [];
    const add = (pos: Position, pts: number[]) => pts.forEach((p, i) => e.push({ playerId: `${pos}${i}`, position: pos, points: p }));
    add("POR", [6, 2]);
    add("DEF", [9, 8, 7, 1, 0]);
    add("MED", [5, 4, 3, 2, 2]);
    add("DEL", [15, 12, 10, 1]);
    add("ENT", [30]);
    const r = idealEleven(e)!;
    expect(r.formation).toBe("3-4-3");
    expect(r.slots).toHaveLength(11);
    expect(r.total).toBe(6 + 9 + 8 + 7 + 5 + 4 + 3 + 2 + 15 + 12 + 10);
    expect(r.slots.some((s) => s.position === "ENT")).toBe(false);
  });

  it("devuelve null si no hay jugadores para ninguna formación", () => {
    expect(idealEleven([{ playerId: "a", position: "POR", points: 3 }])).toBeNull();
  });

  it("solo atribuye puntos a equipos que ya jugaron la última jornada", () => {
    const fixtures = [fx(9, "getafe", "betis", [1, 0]), fx(9, "celta", "elche", [2, 2]), fx(10, "getafe", "celta", [0, 0]), fx(10, "betis", "elche")];
    const players = [
      { id: "g", teamId: "getafe", lastPoints: 7 },
      { id: "c", teamId: "celta", lastPoints: 3 },
      { id: "b", teamId: "betis", lastPoints: 9 }, // aún muestra J9
      { id: "n", teamId: "getafe", lastPoints: null },
    ];
    const r = attributableMatchdayPoints(players, fixtures)!;
    expect(r.matchday).toBe(10);
    expect(r.complete).toBe(false);
    expect(r.rows).toEqual([{ playerId: "g", points: 7 }, { playerId: "c", points: 3 }]);
  });
});
