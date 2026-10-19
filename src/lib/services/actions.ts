import { z } from "zod";
import type { Repo } from "../db/repo";
import { DomainError, today } from "../db/repo";
import { FORMATIONS, POSITIONS } from "../domain/types";
import { parseCsv, pick } from "../domain/csv";
import { parseMoney, parsePosition, parseStatus, normalizeName } from "../domain/normalize";
import { resolveTeamId, TEAMS } from "../domain/teams";
import { remapLineup } from "../domain/formations";
import { buildState } from "./state";
import { seedDemo } from "./demo";
import { matchPlayer, syncAll, syncFixtures, syncLineups, syncMarket } from "./sync";
import type { Workspace } from "../domain/types";

// ───────── Esquemas de validación ─────────

const money = z.number({ error: "Importe no válido" }).int("Usa euros sin decimales").min(0, "No puede ser negativo").max(500_000_000, "Importe demasiado alto");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida (AAAA-MM-DD)");
const prob = z.number().min(0).max(1).nullable();
const position = z.enum(POSITIONS as [string, ...string[]]);
const status = z.enum(["disponible", "duda", "lesionado", "sancionado", "desconocido"]);
const teamId = z.string().refine((t) => TEAMS.some((x) => x.id === t), "Equipo no válido");
const playerId = z.string().min(1);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createPlayer"), name: z.string().trim().min(2, "Nombre demasiado corto").max(60), teamId: teamId.nullable(), position, value: money.nullable(), status, startProb: prob.optional() }),
  z.object({ type: z.literal("updatePlayer"), playerId, value: money.nullable().optional(), status: status.optional(), startProb: prob.optional(), position: position.optional(), teamId: teamId.nullable().optional(), statusNote: z.string().max(120).nullable().optional() }),
  z.object({ type: z.literal("resetPlayer"), playerId }),
  z.object({ type: z.literal("addToSquad"), playerId, purchasePrice: money.min(1, "Indica el precio de compra"), purchaseDate: date, notes: z.string().max(200).nullable().optional() }),
  z.object({ type: z.literal("updateSquad"), playerId, purchasePrice: money.min(1).optional(), purchaseDate: date.optional(), notes: z.string().max(200).nullable().optional() }),
  z.object({ type: z.literal("removeFromSquad"), playerId }),
  z.object({ type: z.literal("buy"), playerId, price: money.min(1, "El precio debe ser mayor que cero"), date, notes: z.string().max(200).nullable().optional(), allowNegative: z.boolean().optional() }),
  z.object({ type: z.literal("sell"), playerId, price: money, date, notes: z.string().max(200).nullable().optional() }),
  z.object({ type: z.literal("setBudget"), budget: z.number().int().min(-500_000_000).max(500_000_000), notes: z.string().max(200).nullable().optional() }),
  z.object({ type: z.literal("deleteTransaction"), id: z.number().int() }),
  z.object({ type: z.literal("saveLineup"), formation: z.enum(FORMATIONS as [string, ...string[]]), useCoach: z.boolean(), lineup: z.record(z.string(), z.string().nullable()) }),
  z.object({ type: z.literal("changeFormation"), formation: z.enum(FORMATIONS as [string, ...string[]]), useCoach: z.boolean() }),
  z.object({ type: z.literal("applyRecommendedLineup") }),
  z.object({ type: z.literal("saveSettings"), teamName: z.string().trim().min(1).max(40).optional(), maxSquadSize: z.number().int().min(11).max(40).optional() }),
  z.object({ type: z.literal("addListing"), playerId, date: date.optional(), askingPrice: money.nullable().optional(), seller: z.string().max(40).nullable().optional() }),
  z.object({ type: z.literal("removeListing"), id: z.number().int() }),
  z.object({ type: z.literal("clearListings"), date }),
  z.object({ type: z.literal("importListingsCsv"), csv: z.string().min(1, "El CSV está vacío").max(500_000), date: date.optional(), createMissing: z.boolean().default(true) }),
  z.object({ type: z.literal("upsertLineupEntry"), id: z.number().int().optional(), matchday: z.number().int().min(1).max(38), teamId, playerName: z.string().trim().min(2).max(60), playerId: z.string().nullable().optional(), role: z.enum(["titular", "suplente", "duda", "lesionado", "sancionado"]), probability: prob.optional() }),
  z.object({ type: z.literal("deleteLineupEntry"), id: z.number().int() }),
  z.object({ type: z.literal("resetDemo") }),
  z.object({ type: z.literal("sync"), kind: z.enum(["market", "fixtures", "lineups", "all"]), force: z.boolean().default(false) }),
]);

export type Action = z.infer<typeof ActionSchema>;

export function formatZodError(e: z.ZodError): string {
  return e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join(" · ");
}

export async function runAction(repo: Repo, workspace: Workspace, a: Action): Promise<{ message: string; data?: unknown }> {
  switch (a.type) {
    case "createPlayer": {
      const p = repo.createManualPlayer({ name: a.name, teamId: a.teamId, position: a.position as never, value: a.value, status: a.status, startProb: a.startProb ?? null });
      return { message: `Jugador ${p.name} creado.`, data: { id: p.id } };
    }
    case "updatePlayer": {
      const { type: _t, playerId: id, ...patch } = a;
      repo.setOverride(id, patch as never);
      return { message: "Datos del jugador actualizados (edición manual)." };
    }
    case "resetPlayer":
      repo.clearOverride(a.playerId);
      return { message: "Se han restaurado los datos de la fuente." };
    case "addToSquad":
      repo.addToSquad({ playerId: a.playerId, purchasePrice: a.purchasePrice, purchaseDate: a.purchaseDate, notes: a.notes ?? null });
      return { message: "Jugador añadido a tu plantilla (sin mover presupuesto)." };
    case "updateSquad":
      repo.updateSquadEntry(a.playerId, { purchasePrice: a.purchasePrice, purchaseDate: a.purchaseDate, notes: a.notes });
      return { message: "Datos de compra actualizados." };
    case "removeFromSquad":
      repo.removeFromSquad(a.playerId);
      return { message: "Jugador quitado de la plantilla (sin registrar venta)." };
    case "buy": {
      const r = repo.buy(a);
      return { message: `Compra registrada. Saldo: ${r.budget.toLocaleString("es-ES")} €.`, data: r };
    }
    case "sell": {
      const r = repo.sell(a);
      return { message: `Venta registrada (${r.profit >= 0 ? "+" : ""}${r.profit.toLocaleString("es-ES")} € frente a la compra). Saldo: ${r.budget.toLocaleString("es-ES")} €.`, data: r };
    }
    case "setBudget": {
      const r = repo.setBudget(a.budget, today(), a.notes);
      return { message: `Presupuesto fijado en ${r.budget.toLocaleString("es-ES")} €.`, data: r };
    }
    case "deleteTransaction":
      repo.deleteTransaction(a.id);
      return { message: "Operación eliminada del historial (el saldo no se modifica)." };
    case "saveLineup":
      repo.saveLineup(a.formation as never, a.useCoach, a.lineup);
      return { message: "Alineación guardada." };
    case "changeFormation": {
      const s = repo.getSettings();
      const lineup = remapLineup(s.lineup, a.formation as never, a.useCoach);
      repo.saveSettings({ formation: a.formation as never, useCoach: a.useCoach, lineup });
      return { message: `Formación cambiada a ${a.formation}.` };
    }
    case "applyRecommendedLineup": {
      const st = buildState(repo, workspace);
      const lineup = Object.fromEntries(st.lineupRec.slots.map((s) => [s.slot, s.playerId]));
      repo.saveLineup(st.lineupRec.formation, st.settings.useCoach, lineup);
      return { message: `Aplicado el once recomendado (${st.lineupRec.formation}).` };
    }
    case "saveSettings":
      if (a.maxSquadSize != null && a.maxSquadSize < repo.getSquad().length) throw new DomainError("El máximo no puede ser menor que tu plantilla actual.");
      repo.saveSettings({ teamName: a.teamName, maxSquadSize: a.maxSquadSize });
      return { message: "Ajustes guardados." };
    case "addListing":
      repo.addListing({ date: a.date ?? today(), playerId: a.playerId, askingPrice: a.askingPrice ?? null, seller: a.seller ?? null });
      return { message: "Jugador añadido al mercado del día." };
    case "removeListing":
      repo.removeListing(a.id);
      return { message: "Jugador quitado del mercado del día." };
    case "clearListings":
      repo.clearListings(a.date);
      return { message: "Mercado del día vaciado." };
    case "importListingsCsv":
      return importListings(repo, a.csv, a.date ?? today(), a.createMissing);
    case "upsertLineupEntry":
      repo.upsertManualLineupEntry({ id: a.id, matchday: a.matchday, teamId: a.teamId, playerName: a.playerName, playerId: a.playerId ?? null, role: a.role, probability: a.probability ?? null });
      if (a.playerId) {
        const st = a.role === "lesionado" ? "lesionado" : a.role === "sancionado" ? "sancionado" : a.role === "duda" ? "duda" : "disponible";
        repo.updateAvailability([{ id: a.playerId, status: st, startProb: a.probability ?? null, note: "Editado manualmente" }]);
      }
      return { message: "Alineación probable actualizada (edición manual)." };
    case "deleteLineupEntry":
      repo.deleteLineupEntry(a.id);
      return { message: "Entrada eliminada." };
    case "resetDemo": {
      if (workspace !== "demo") throw new DomainError("Solo se puede regenerar el espacio de demostración.");
      const r = seedDemo(repo);
      return { message: `Datos de demostración regenerados (${r.players} jugadores ficticios).` };
    }
    case "sync": {
      if (workspace === "demo") throw new DomainError("Estás en modo demostración: la sincronización solo se usa con datos reales.");
      const results =
        a.kind === "all" ? await syncAll(repo, a.force) : [await (a.kind === "market" ? syncMarket : a.kind === "fixtures" ? syncFixtures : syncLineups)(repo, a.force)];
      const failed = results.filter((r) => r.status === "error");
      return { message: results.map((r) => `${r.kind}: ${r.message}`).join("\n"), data: { results, failed: failed.length } };
    }
  }
}

function importListings(repo: Repo, csv: string, date: string, createMissing: boolean) {
  const { headers, rows } = parseCsv(csv);
  if (!headers.some((h) => ["nombre", "jugador", "name"].includes(h))) throw new DomainError("El CSV necesita una columna 'nombre' (o 'jugador').");
  const catalog = repo.getPlayers();
  let added = 0, created = 0;
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    const name = pick(row, "nombre", "jugador", "name");
    if (!name) { errors.push(`Línea ${line}: falta el nombre`); return; }
    const team = resolveTeamId(pick(row, "equipo", "club", "team"));
    const price = parseMoney(pick(row, "precio", "valor", "price", "value") ?? null);
    const seller = pick(row, "vendedor", "seller") ?? null;
    let player = matchPlayer(catalog, team, normalizeName(name));
    if (!player && !team) player = matchPlayer(catalog, null, normalizeName(name));
    if (!player) {
      if (!createMissing) { errors.push(`Línea ${line}: ${name} no está en el catálogo`); return; }
      const pos = parsePosition(pick(row, "posicion", "pos", "position"));
      if (!pos) { errors.push(`Línea ${line}: ${name} no existe y falta su posición`); return; }
      try {
        player = repo.createManualPlayer({ name, teamId: team, position: pos, value: price, status: parseStatus(pick(row, "estado", "status")) ?? "desconocido", startProb: null, source: "csv" });
        catalog.push(player);
        created++;
      } catch (e) {
        errors.push(`Línea ${line}: ${e instanceof Error ? e.message : e}`);
        return;
      }
    }
    repo.addListing({ date, playerId: player.id, askingPrice: price, seller });
    added++;
  });
  return {
    message: `${added} jugadores importados al mercado del ${date}${created ? ` (${created} creados como nuevos)` : ""}${errors.length ? `. ${errors.length} con errores.` : "."}`,
    data: { added, created, errors },
  };
}
