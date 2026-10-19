import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { DomainError, SqliteRepo as Repo } from "@/lib/db/repo";
import { asStore } from "@/lib/db/sqlite-store";
import { closeDb, openDb } from "@/lib/db/sqlite";
import { ActionSchema, runAction } from "@/lib/services/actions";

let repo: Repo;
const mk = (name: string, position: "POR" | "DEF" | "MED" | "DEL", value: number, teamId = "getafe") =>
  repo.createManualPlayer({ name, teamId, position, value, status: "disponible", startProb: null });

beforeEach(() => {
  closeDb(":memory:");
  repo = new Repo(openDb("real", ":memory:") as DatabaseSync, "local");
});

describe("persistencia y economía", () => {
  it("compra y venta mueven el presupuesto correctamente", () => {
    repo.setBudget(10_000_000, "2026-10-19");
    const p = mk("Ana Prueba", "MED", 4_000_000);
    expect(repo.buy({ playerId: p.id, price: 4_250_000, date: "2026-10-19" }).budget).toBe(5_750_000);
    expect(repo.getSquad()).toHaveLength(1);
    const s = repo.sell({ playerId: p.id, price: 5_000_000, date: "2026-10-20" });
    expect(s.budget).toBe(10_750_000);
    expect(s.profit).toBe(750_000);
    expect(repo.getSquad()).toHaveLength(0);
    const txs = repo.getTransactions();
    expect(txs.map((t) => t.type).sort()).toEqual(["ajuste", "compra", "venta"]);
    expect(txs.find((t) => t.type === "venta")!.costBasis).toBe(4_250_000);
  });

  it("rechaza compras sin saldo salvo confirmación explícita", () => {
    repo.setBudget(1_000_000, "2026-10-19");
    const p = mk("Caro", "DEL", 9_000_000);
    expect(() => repo.buy({ playerId: p.id, price: 9_000_000, date: "2026-10-19" })).toThrow(DomainError);
    expect(repo.getSettings().budget).toBe(1_000_000);
    expect(repo.getSquad()).toHaveLength(0); // la transacción no deja restos
    expect(repo.buy({ playerId: p.id, price: 9_000_000, date: "2026-10-19", allowNegative: true }).budget).toBe(-8_000_000);
  });

  it("respeta el máximo de plantilla y evita duplicados", () => {
    repo.saveSettings({ maxSquadSize: 11 });
    for (let i = 0; i < 11; i++) repo.addToSquad({ playerId: mk(`J${i}`, "DEF", 1_000_000).id, purchasePrice: 1, purchaseDate: "2026-10-01", notes: null });
    expect(() => repo.addToSquad({ playerId: mk("Extra", "DEF", 1).id, purchasePrice: 1, purchaseDate: "2026-10-01", notes: null })).toThrow(/plantilla/);
    const first = repo.getSquad()[0].playerId;
    repo.saveSettings({ maxSquadSize: 24 });
    expect(() => repo.addToSquad({ playerId: first, purchasePrice: 1, purchaseDate: "2026-10-01", notes: null })).toThrow(/ya está/);
  });

  it("valida la alineación y la limpia al vender", () => {
    repo.setBudget(50_000_000, "2026-10-19");
    const gk = mk("Portero", "POR", 1_000_000);
    const df = mk("Defensa", "DEF", 1_000_000);
    repo.buy({ playerId: gk.id, price: 1_000_000, date: "2026-10-19" });
    repo.buy({ playerId: df.id, price: 1_000_000, date: "2026-10-19" });
    expect(() => repo.saveLineup("4-3-3", false, { "POR-1": df.id })).toThrow(/no puede jugar/);
    repo.saveLineup("4-3-3", false, { "POR-1": gk.id, "DEF-1": df.id });
    repo.sell({ playerId: df.id, price: 1_000_000, date: "2026-10-19" });
    expect(repo.getSettings().lineup["DEF-1"]).toBeNull();
  });

  it("las ediciones manuales prevalecen sobre la sincronización", () => {
    const p = mk("Editado", "MED", 2_000_000);
    repo.setOverride(p.id, { status: "lesionado", value: 3_000_000 });
    repo.upsertPlayers([{ ...repo.getPlayer(p.id)!, value: 2_500_000, status: "disponible" }]);
    const after = repo.getPlayer(p.id)!;
    expect(after.status).toBe("lesionado");
    expect(after.value).toBe(3_000_000);
    expect(after.overridden.sort()).toEqual(["status", "value"]);
    repo.clearOverride(p.id);
    expect(repo.getPlayer(p.id)!.value).toBe(2_500_000);
  });

  it("fusiona un jugador manual con el de la fuente", () => {
    repo.setBudget(10_000_000, "2026-10-19");
    const manual = mk("Pepe Fuente", "DEF", 1_000_000);
    repo.buy({ playerId: manual.id, price: 1_000_000, date: "2026-10-19" });
    repo.upsertPlayers([{ ...repo.getPlayer(manual.id)!, id: "ff:99", source: "futbolfantasy", sourceId: "99", value: 1_200_000 }]);
    repo.relinkPlayer(manual.id, "ff:99");
    expect(repo.getSquad()[0].playerId).toBe("ff:99");
    expect(repo.getPlayer(manual.id)).toBeNull();
  });
});

describe("acciones (API)", () => {
  it("valida la entrada", () => {
    expect(ActionSchema.safeParse({ type: "buy", playerId: "x", price: -5, date: "2026-10-19" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "buy", playerId: "x", price: 5.5, date: "2026-10-19" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "buy", playerId: "x", price: 5, date: "19/10/2026" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "createPlayer", name: "A", teamId: "getafe", position: "MED", value: null, status: "disponible" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "nada" }).success).toBe(false);
  });

  it("importa el mercado del día por CSV creando los que faltan", async () => {
    mk("Nico Williams", "DEL", 38_000_000, "athletic");
    const r = await runAction(asStore(repo), "real", ActionSchema.parse({
      type: "importListingsCsv",
      date: "2026-10-19",
      csv: "nombre;equipo;posicion;precio\nNico Williams;Athletic;DEL;38.500.000\nNuevo Fichaje;Getafe;MED;1,2M\nSin Posicion;Getafe;;1M\n",
    }));
    const d = r.data as { added: number; created: number; errors: string[] };
    expect(d.added).toBe(2);
    expect(d.created).toBe(1);
    expect(d.errors).toHaveLength(1);
    const ls = repo.getListings("2026-10-19");
    expect(ls.map((l) => l.askingPrice).sort()).toEqual([1_200_000, 38_500_000]);
  });

  it("no permite sincronizar en modo demo", async () => {
    await expect(runAction(asStore(repo), "demo", ActionSchema.parse({ type: "sync", kind: "market" }))).rejects.toThrow(/demostración/);
  });
});
