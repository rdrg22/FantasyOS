import { describe, expect, it } from "vitest";
import { computeTrend } from "@/lib/analytics/trends";
import { analyzePlayer, buildContext } from "@/lib/analytics/analysis";
import { recommendLineup, compareLineup } from "@/lib/analytics/lineup";
import { generateRecommendations } from "@/lib/analytics/recommendations";
import { calendarState } from "@/lib/analytics/fixtures";
import type { Fixture, Player, Position, PriceSnapshot, Settings } from "@/lib/domain/types";

const TODAY = "2026-10-19";
let n = 0;
function player(p: Partial<Player> & { position: Position }): Player {
  n++;
  return {
    id: p.id ?? `t:${n}`,
    name: p.name ?? `Jugador ${n}`,
    shortName: null,
    normName: `jugador ${n}`,
    teamId: p.teamId ?? "getafe",
    status: "disponible",
    statusNote: null,
    startProb: 0.8,
    value: 5_000_000,
    sourceHistory: null,
    sourceStreakDays: null,
    sourceAcceleration: null,
    nextOpponentId: null,
    nextHome: null,
    nextMatchday: null,
    pointsTotal: 40,
    pointsAvg: 5,
    points5: 25,
    played5: 5,
    matchesPlayed: 8,
    lastPoints: 5,
    source: "manual",
    sourceId: null,
    updatedAt: TODAY,
    overridden: [],
    ...p,
  };
}

const ctx = buildContext([], [], TODAY, new Date("2026-10-19T12:00:00Z"));

describe("tendencias", () => {
  it("usa el histórico de la fuente cuando no hay instantáneas", () => {
    const t = computeTrend(player({ position: "DEF", value: 110, sourceHistory: { d1: 100, d2: 98, d3: 96, d7: 90, d14: null, d30: null } }), [], TODAY);
    expect(t.pct1).toBeCloseTo(10);
    expect(t.basis).toBe("fuente");
    expect(t.direction).toBe("sube");
    expect(t.accelLabel).toBe("acelera");
    expect(t.series.map((s) => s.label)).toEqual(["-7 merc.", "-3 merc.", "-2 merc.", "-1 merc.", "hoy"]);
  });
  it("prioriza instantáneas propias con fechas reales", () => {
    const snaps: PriceSnapshot[] = [
      { playerId: "x", date: "2026-10-16", value: 100, source: "futbolfantasy" },
      { playerId: "x", date: "2026-10-18", value: 95, source: "futbolfantasy" },
      { playerId: "x", date: "2026-10-19", value: 90, source: "futbolfantasy" },
    ];
    const t = computeTrend(player({ id: "x", position: "MED", value: 90 }), snaps, TODAY);
    expect(t.basis).toBe("instantaneas");
    expect(t.pct1).toBeCloseTo(-5.263, 2);
    expect(t.pct3).toBeCloseTo(-10);
    expect(t.direction).toBe("baja");
  });
  it("no inventa histórico", () => {
    const t = computeTrend(player({ position: "DEL", value: 1_000_000 }), [], TODAY);
    expect(t.basis).toBe("sin-datos");
    expect(t.series).toHaveLength(0);
    expect(t.pct1).toBeNull();
  });
});

describe("puntos esperados", () => {
  it("lesionado = 0 y probabilidad reduce los puntos", () => {
    expect(analyzePlayer(player({ position: "DEF", status: "lesionado" }), [], ctx).xp).toBe(0);
    const a = analyzePlayer(player({ position: "DEF", startProb: 0.5, pointsAvg: 6, points5: 30, played5: 5 }), [], ctx);
    expect(a.xp).toBeCloseTo(3, 1);
    expect(a.pPlaySource).toBe("fuente");
  });
});

function squadOf(spec: [Position, number, Partial<Player>?][]) {
  return spec.map(([pos, avg, extra]) => player({ position: pos, pointsAvg: avg, points5: avg * 5, played5: 5, ...(extra ?? {}) }));
}

describe("once recomendado", () => {
  it("elige la formación con más puntos esperados y respeta posiciones", () => {
    const ps = squadOf([["POR", 4], ["POR", 2], ["DEF", 3], ["DEF", 3], ["DEF", 3], ["DEF", 1], ["DEF", 1], ["MED", 6], ["MED", 6], ["MED", 6], ["MED", 6], ["MED", 6], ["DEL", 7], ["DEL", 1], ["DEL", 1]]);
    const as = ps.map((p) => analyzePlayer(p, [], ctx));
    const rec = recommendLineup(as, false);
    expect(rec.formation).toBe("3-5-2");
    expect(rec.slots.filter((s) => s.playerId)).toHaveLength(11);
    for (const s of rec.slots) expect(ps.find((p) => p.id === s.playerId)!.position).toBe(s.position);
  });
  it("detecta lesionados en la alineación guardada y sugiere sustituto", () => {
    const ps = squadOf([["POR", 4], ["DEF", 3], ["DEF", 3], ["DEF", 3], ["DEF", 3], ["DEF", 2], ["MED", 5], ["MED", 5], ["MED", 5], ["DEL", 6], ["DEL", 6], ["DEL", 6, { status: "lesionado" }], ["DEL", 4]]);
    const as = ps.map((p) => analyzePlayer(p, [], ctx));
    const map = new Map(as.map((a) => [a.player.id, a]));
    const rec = recommendLineup(as, false);
    const current: Record<string, string | null> = { "POR-1": ps[0].id, "DEF-1": ps[1].id, "DEF-2": ps[2].id, "DEF-3": ps[3].id, "DEF-4": ps[4].id, "MED-1": ps[6].id, "MED-2": ps[7].id, "MED-3": ps[8].id, "DEL-1": ps[9].id, "DEL-2": ps[10].id, "DEL-3": ps[11].id };
    const cmp = compareLineup(current, map, rec, new Set(ps.map((p) => p.id)));
    const issue = cmp.issues.find((i) => i.playerId === ps[11].id)!;
    expect(issue.severity).toBe("alta");
    expect(issue.suggestion).toBe(ps[12].id);
  });
});

describe("motor de recomendaciones", () => {
  const settings = (budget: number, max = 24): Settings => ({ budget, formation: "4-3-3", lineup: {}, useCoach: false, maxSquadSize: max, teamName: "t" });
  const base = () => squadOf([["POR", 4], ["DEF", 3], ["DEF", 3], ["DEF", 3], ["DEF", 3], ["MED", 5], ["MED", 5], ["MED", 5], ["DEL", 2, { value: 9_000_000 }], ["DEL", 6], ["DEL", 6], ["DEL", 1, { value: 3_000_000 }]]);

  function run(budget: number, candidates: Player[], max = 24) {
    const squadPlayers = base();
    const all = [...squadPlayers, ...candidates];
    const analyses = new Map(all.map((p) => [p.id, analyzePlayer(p, [], ctx)]));
    const squadA = squadPlayers.map((p) => analyses.get(p.id)!);
    const lineupRec = recommendLineup(squadA, false);
    const recs = generateRecommendations({
      analyses,
      squad: squadPlayers.map((p) => ({ playerId: p.id, purchasePrice: p.value!, purchaseDate: "2026-10-01", notes: null })),
      settings: settings(budget, max),
      listings: candidates.map((c, i) => ({ id: i, date: TODAY, playerId: c.id, askingPrice: c.value, seller: null })),
      lineupRec,
      lineupCmp: null,
    });
    return { recs, squadPlayers };
  }

  it("nunca recomienda una compra que deje el saldo en negativo", () => {
    const star = player({ position: "DEL", value: 30_000_000, pointsAvg: 9, points5: 45, played5: 5 });
    const { recs } = run(1_000_000, [star]);
    for (const r of recs.filter((x) => x.action === "COMPRAR")) {
      expect(r.budget.after).toBeGreaterThanOrEqual(0);
      expect(r.budget.after).toBe(r.budget.before + r.budget.income - r.budget.cost);
    }
    // 30M no se cubre con 1M + ninguna venta razonable -> vigilar
    expect(recs.find((r) => r.playerId === star.id)?.action).toBe("VIGILAR");
  });

  it("propone operación combinada con venta cuando el saldo no llega", () => {
    const fw = player({ position: "DEL", value: 10_000_000, pointsAvg: 8, points5: 40, played5: 5 });
    const { recs, squadPlayers } = run(2_000_000, [fw]);
    const r = recs.find((x) => x.playerId === fw.id)!;
    expect(r.action).toBe("COMPRAR");
    expect(r.intent === "puntos" || r.intent === "mixta").toBe(true);
    expect(r.replaces).not.toBeNull();
    expect(squadPlayers.map((p) => p.id)).toContain(r.replaces!.playerId);
    expect(r.budget.after).toBe(2_000_000 + r.replaces!.saleValue - 10_000_000);
    expect(r.budget.after).toBeGreaterThanOrEqual(0);
  });

  it("distingue compra para revalorizar de compra para puntuar", () => {
    const riser = player({ position: "DEF", value: 2_000_000, pointsAvg: 1, points5: 5, played5: 5, startProb: 0.85, sourceHistory: { d1: 1_900_000, d2: 1_820_000, d3: 1_760_000, d7: 1_550_000, d14: null, d30: null } });
    const { recs } = run(20_000_000, [riser]);
    const r = recs.find((x) => x.playerId === riser.id)!;
    expect(r.action).toBe("COMPRAR");
    expect(r.intent).toBe("revalorizacion");
    expect(r.lineupImpact).toMatch(/suplente/);
  });

  it("con la plantilla llena exige vender", () => {
    const fw = player({ position: "DEL", value: 4_000_000, pointsAvg: 8, points5: 40, played5: 5 });
    const { recs } = run(50_000_000, [fw], 12);
    const r = recs.find((x) => x.playerId === fw.id)!;
    expect(r.replaces).not.toBeNull();
  });

  it("aviso de saldo negativo con prioridad máxima", () => {
    const { recs } = run(-500_000, []);
    expect(recs[0].action).toBe("SALDO");
  });
});

describe("calendario", () => {
  const fx = (md: number, date: string, h: string, a: string, score?: [number, number], kickoff?: string): Fixture => ({
    id: `${md}${h}${a}`, season: "s", matchday: md, date, kickoff: kickoff ?? null, homeId: h, awayId: a,
    homeScore: score?.[0] ?? null, awayScore: score?.[1] ?? null, source: "demo", updatedAt: "",
  });
  it("detecta jornada siguiente y partidos aplazados", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    const c = calendarState([
      fx(6, "2026-09-20", "levante", "athletic"),
      fx(6, "2026-10-21", "alaves", "betis"), // aplazado a una fecha futura
      fx(6, "2026-09-20", "getafe", "rayo", [1, 0]),
      fx(9, "2026-10-18", "elche", "celta", [2, 2]),
      fx(9, "2026-10-19", "getafe", "rayo", undefined, "2026-10-19T19:00:00.000Z"),
      fx(10, "2026-10-23", "rayo", "elche"),
    ], now);
    expect(c.next?.matchday).toBe(10);
    expect(c.pending.map((f) => f.homeId).sort()).toEqual(["alaves", "getafe"]);
    expect(c.table.get("getafe")!.points).toBe(3);
    expect(c.table.get("elche")!.points).toBe(1);
  });
});
