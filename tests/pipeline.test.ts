import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Repo } from "@/lib/db/repo";
import { openDb, closeDb } from "@/lib/db/sqlite";
import { seedDemo } from "@/lib/services/demo";
import { buildState } from "@/lib/services/state";
import { fmtMoney } from "@/lib/domain/money";

let repo: Repo;
beforeAll(() => {
  closeDb(":memory:");
  repo = new Repo(openDb("demo", ":memory:") as DatabaseSync, "local");
  seedDemo(repo, new Date("2026-10-19T12:00:00Z"));
});

describe("pipeline demo", () => {
  it("construye el estado y genera recomendaciones", () => {
    const s = buildState(repo, "demo", new Date("2026-10-19T12:00:00Z"));
    expect(s.squad.length).toBe(15);
    expect(s.calendar.next?.matchday).toBe(10);
    expect(s.lineupRec.slots.filter((x) => x.playerId).length).toBe(11);
    const counts: Record<string, number> = {};
    for (const r of s.recommendations) counts[r.action] = (counts[r.action] ?? 0) + 1;
    console.log("acciones", counts, "once", s.lineupRec.formation, s.lineupRec.total.toFixed(1), "actual", s.lineupCmp.currentTotal.toFixed(1));
    for (const r of s.recommendations.slice(0, 6)) {
      console.log(`[${r.priority}] ${r.action} ${r.title} | ${fmtMoney(r.price)} | ${r.intent ?? ""} | conf ${r.confidence.level}\n   ${r.reasons.join(" / ")}\n   presupuesto ${fmtMoney(r.budget.before)} -> ${fmtMoney(r.budget.after)} ${r.budget.note ?? ""}`);
    }
    expect(counts.COMPRAR ?? 0).toBeGreaterThan(0);
    expect(counts.ALINEAR ?? 0).toBeGreaterThan(0);
    for (const r of s.recommendations.filter((x) => x.action === "COMPRAR")) expect(r.budget.after).toBeGreaterThanOrEqual(0);
  });
});
