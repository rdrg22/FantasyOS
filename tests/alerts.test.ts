import { describe, expect, it } from "vitest";
import { computeAlerts, type AlertInput } from "@/lib/analytics/alerts";
import { evaluateSyncHealth } from "@/lib/services/health";
import type { SyncLogEntry } from "@/lib/domain/types";

const base = (over: Partial<AlertInput> = {}): AlertInput => ({
  squad: [{ id: "a", name: "Ana", status: "disponible", statusNote: null, warned: false, inLineup: true }],
  next: null,
  emptySlots: 0,
  syncErrors: [],
  ...over,
});

describe("avisos push", () => {
  it("avisa una sola vez de una lesión y de la vuelta", () => {
    const hurt = base({ squad: [{ id: "a", name: "Ana", status: "lesionado", statusNote: "Rotura", warned: false, inLineup: true }] });
    const r1 = computeAlerts(hurt, new Map());
    expect(r1.messages.map((m) => m.title)).toEqual(["🚑 Ana está lesionado"]);
    const state = new Map(r1.updates);
    expect(computeAlerts(hurt, state).messages).toHaveLength(0);
    const back = computeAlerts(base(), state);
    expect(back.messages[0].title).toContain("vuelve a estar disponible");
  });

  it("no avisa de jugadores disponibles ni de estado desconocido la primera vez", () => {
    expect(computeAlerts(base(), new Map()).messages).toHaveLength(0);
    const unk = base({ squad: [{ id: "a", name: "Ana", status: "desconocido", statusNote: null, warned: false, inLineup: false }] });
    expect(computeAlerts(unk, new Map()).messages).toHaveLength(0);
  });

  it("apercibidos e inicio de jornada con huecos", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    const input = base({
      squad: [{ id: "a", name: "Ana", status: "disponible", statusNote: null, warned: true, inLineup: true }],
      next: { matchday: 10, firstKickoff: "2026-10-24T19:00:00Z" },
      emptySlots: 2,
    });
    const r = computeAlerts(input, new Map(), now);
    expect(r.messages.map((m) => m.tag)).toEqual(["warned:a", "md:10"]);
    expect(r.messages[1].body).toContain("2 huecos vacíos");
    // 3 h antes: segundo aviso porque sigue habiendo huecos
    const r2 = computeAlerts(input, new Map(r.updates), Date.parse("2026-10-24T16:30:00Z"));
    expect(r2.messages.map((m) => m.tag)).toEqual(["md:10"]);
    expect(computeAlerts(input, new Map([...r.updates, ...r2.updates]), Date.parse("2026-10-24T17:00:00Z")).messages).toHaveLength(0);
  });
});

const entry = (status: SyncLogEntry["status"], at: string): SyncLogEntry => ({ id: 1, source: "x", kind: "market", startedAt: at, finishedAt: at, status, message: "boom", count: null });
const none = { ok: null, error: null };

describe("salud de la sincronización", () => {
  it("un fallo posterior al último éxito es un problema; uno anterior no", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const rest = { fixtures: none, results: none, points: none, lineups: none };
    const bad = evaluateSyncHealth({ ...rest, market: { ok: entry("ok", "2026-10-20T07:00:00Z"), error: entry("error", "2026-10-20T11:00:00Z") } }, now);
    expect(bad.map((i) => i.type)).toEqual(["error"]);
    const fine = evaluateSyncHealth({ ...rest, market: { ok: entry("ok", "2026-10-20T11:00:00Z"), error: entry("error", "2026-10-20T07:00:00Z") } }, now);
    expect(fine).toHaveLength(0);
    const old = evaluateSyncHealth({ ...rest, market: { ok: entry("ok", "2026-10-18T07:00:00Z"), error: null } }, now);
    expect(old.map((i) => i.type)).toEqual(["antiguo"]);
  });
});
