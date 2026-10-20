import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseFfMarket, parseFfPoints } from "@/lib/providers/futbolfantasy/market";
import { parseHubLinks, parseMatchPage, parseMatchTitle } from "@/lib/providers/futbolfantasy/lineups";
import { parseOpenfootball } from "@/lib/providers/openfootball";

// Pruebas opcionales contra HTML real descargado (no se incluye en el repositorio).
// Uso: FOS_FIXTURE_DIR=/ruta/con/html npm test
const dir = process.env.FOS_FIXTURE_DIR;
const read = (f: string) => fs.readFileSync(path.join(dir!, f), "utf8");

describe.runIf(Boolean(dir))("parsers contra páginas reales", () => {
  it("mercado", () => {
    const r = parseFfMarket(read("ff_mercado.html"));
    expect(r.players.length).toBeGreaterThan(500);
    const sivera = r.players.find((p) => p.ffId === "1059")!;
    expect(sivera.name).toBe("Antonio Sivera");
    expect(sivera.teamId).toBe("alaves");
    expect(sivera.value).toBe(43762900);
    expect(sivera.history.d1).toBe(44257552);
    expect(sivera.startProb).toBe(0.95);
    expect(sivera.nextOpponentId).toBe("malaga");
    expect(sivera.nextHome).toBe(true);
    expect(r.sourceUpdatedAt).toMatch(/^2026-10-19T/);
    const coach = r.players.find((p) => p.position === "ENT");
    expect(coach).toBeTruthy();
    console.log("mercado", r.players.length, "descartados", r.skipped);
  });
  it("puntos", () => {
    const r = parseFfPoints(read("ff_puntos.html"));
    expect(r.rows.length).toBeGreaterThan(400);
    const g = r.rows.find((x) => x.ffId === "44")!;
    expect(g.pointsTotal).toBe(33);
    expect(g.matchesPlayed).toBe(7);
    console.log("puntos", r.rows.length, "descartados", r.skipped);
  });
  it("alineaciones", () => {
    const hub = parseHubLinks(read("ff_al.html"));
    expect(hub.get("getafe-rayo")).toContain("/partidos/");
    const html = read("ff_match.html");
    expect(parseMatchTitle(html)).toEqual({ home: "Getafe", away: "Rayo" });
    const r = parseMatchPage(html, "Getafe", "Rayo");
    const titulares = r.home.filter((p) => p.role === "titular" || p.role === "duda");
    console.log("local", r.home.length, "titulares", titulares.length, r.home.filter((p) => p.role === "lesionado").map((p) => p.displayName));
    console.log("visitante", r.away.length, r.away.slice(0, 12).map((p) => `${p.displayName}:${p.role}:${p.probability}`).join(", "));
    expect(titulares.length).toBeGreaterThanOrEqual(9);
    expect(r.home.find((p) => p.slug === "nemanja-gudelj")?.probability).toBe(0.8);
    expect(r.home.find((p) => p.slug === "juanmi-jimenez")?.role).toBe("lesionado");
  });
  it("openfootball", () => {
    const r = parseOpenfootball(JSON.parse(read("of_es1.json")), "2026-27");
    expect(r.fixtures.length).toBe(380);
    expect(r.unknownTeams).toEqual([]);
  });
});

describe.runIf(Boolean(dir))("tarjetas y resultados contra páginas reales", () => {
  it("tarjetas y apercibidos por jugador", async () => {
    const { parseMatchPage } = await import("@/lib/providers/futbolfantasy/lineups");
    const r = parseMatchPage(read("ff_match.html"), "Getafe", "Rayo");
    const all = [...r.home, ...r.away];
    expect(all.filter((p) => p.yellow != null).length).toBeGreaterThan(30);
    expect(all.some((p) => p.warned)).toBe(true);
    expect(r.home.find((p) => p.slug === "nemanja-gudelj")?.yellow).toBe(2);
    console.log("apercibidos", all.filter((p) => p.warned).map((p) => `${p.displayName}:${p.yellow}`));
  });
  it("resultados de la página central", async () => {
    const { parseHubResults } = await import("@/lib/providers/futbolfantasy/lineups");
    const { getTeam } = await import("@/lib/domain/teams");
    const res = parseHubResults(read("ff_al.html"), (id) => Boolean(getTeam(id)));
    console.log("resultados", res.map((x) => `${x.homeId} ${x.homeScore}-${x.awayScore} ${x.awayId}`));
    expect(res.find((x) => x.homeId === "deportivo" && x.awayId === "levante")).toMatchObject({ homeScore: 1, awayScore: 1 });
    expect(res.length).toBeGreaterThanOrEqual(8);
  });
});
