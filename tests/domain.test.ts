import { describe, expect, it } from "vitest";
import { parseMoney, normalizeName, parsePosition, parseStatus } from "@/lib/domain/normalize";
import { pnl, pctChange, fmtCompact } from "@/lib/domain/money";
import { resolveTeamId } from "@/lib/domain/teams";
import { formationSlots, remapLineup } from "@/lib/domain/formations";
import { madridToIso, addDays, daysBetween } from "@/lib/domain/time";
import { parseCsv, pick } from "@/lib/domain/csv";

describe("importes", () => {
  it("interpreta los formatos habituales", () => {
    expect(parseMoney("1.250.000")).toBe(1_250_000);
    expect(parseMoney("1.250.000 €")).toBe(1_250_000);
    expect(parseMoney("1,25M")).toBe(1_250_000);
    expect(parseMoney("750k")).toBe(750_000);
    expect(parseMoney("43762900")).toBe(43_762_900);
    expect(parseMoney("1,5")).toBe(2); // 1,5 € redondeado
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(1234.4)).toBe(1234);
  });
  it("calcula ganancias y pérdidas", () => {
    expect(pnl(10_000_000, 12_500_000)).toEqual({ invested: 10_000_000, current: 12_500_000, diff: 2_500_000, pct: 25 });
    expect(pnl(10_000_000, 8_000_000).diff).toBe(-2_000_000);
    expect(pnl(5_000_000, null).diff).toBe(0);
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(100, 0)).toBeNull();
    expect(fmtCompact(12_345_678)).toBe("12,35M");
  });
});

describe("normalización", () => {
  it("nombres y equipos", () => {
    expect(normalizeName("Íñigo Ruiz de Galarreta")).toBe("inigo ruiz de galarreta");
    expect(resolveTeamId("Club Atlético de Madrid")).toBe("atletico");
    expect(resolveTeamId("RC Deportivo La Coruña")).toBe("deportivo");
    expect(resolveTeamId("Real Racing Club de Santander")).toBe("racing");
    expect(resolveTeamId("R. Sociedad")).toBe("real-sociedad");
    expect(resolveTeamId("Equipo inventado")).toBeNull();
  });
  it("posiciones y estados", () => {
    expect(parsePosition("Mediocampista")).toBe("MED");
    expect(parsePosition("dc")).toBe("DEL");
    expect(parsePosition("Entrenador")).toBe("ENT");
    expect(parseStatus("Lesionado")).toBe("lesionado");
    expect(parseStatus("xyz")).toBeNull();
  });
});

describe("formaciones", () => {
  it("genera huecos", () => {
    expect(formationSlots("4-3-3", false)).toHaveLength(11);
    expect(formationSlots("5-4-1", true)).toHaveLength(12);
  });
  it("reubica jugadores al cambiar de formación", () => {
    const l = { "POR-1": "p", "DEF-1": "d1", "DEF-2": "d2", "DEF-3": "d3", "DEF-4": "d4", "MED-1": "m1", "MED-2": "m2", "MED-3": "m3", "DEL-1": "a1", "DEL-2": "a2", "DEL-3": "a3" };
    const r = remapLineup(l, "3-5-2", false);
    expect(Object.values(r).filter(Boolean)).toHaveLength(9); // sobra 1 DEF y 1 DEL, faltan 2 MED
    expect(r["MED-4"]).toBeNull();
    expect(r["DEF-3"]).toBe("d3");
  });
});

describe("fechas", () => {
  it("convierte hora de Madrid con horario de verano e invierno", () => {
    expect(madridToIso("2026-08-15", "19:30")).toBe("2026-08-15T17:30:00.000Z"); // CEST +2
    expect(madridToIso("2026-11-15", "21:00")).toBe("2026-11-15T20:00:00.000Z"); // CET +1
  });
  it("aritmética de días", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-16", "2026-10-19")).toBe(3);
  });
});

describe("CSV", () => {
  it("detecta separador y comillas", () => {
    const { headers, rows } = parseCsv('Nombre;Equipo;Precio\n"Williams, Nico";Athletic;"38.500.000"\nPedri;Barcelona;45M\n');
    expect(headers).toEqual(["nombre", "equipo", "precio"]);
    expect(rows[0].nombre).toBe("Williams, Nico");
    expect(pick(rows[1], "precio")).toBe("45M");
  });
});
