import { z } from "zod";
import type { Store } from "../db/common";
import { DomainError, today } from "../db/common";
import { FORMATIONS, POSITIONS } from "../domain/types";
import { parseCsv, pick } from "../domain/csv";
import { parseMoney, parsePosition, parseStatus, normalizeName } from "../domain/normalize";
import { resolveTeamId, TEAMS } from "../domain/teams";
import { remapLineup } from "../domain/formations";
import { buildState } from "./state";
import { seedDemo } from "./demo";
import { matchPlayer, syncStep } from "./sync";
import { pushEnabled, sendPush } from "./notify";
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
  z.object({ type: z.literal("setClause"), playerId, clause: money.min(1, "Indica la cláusula"), cost: money.default(0), date, notes: z.string().max(200).nullable().optional() }),
  z.object({ type: z.literal("deleteTransaction"), id: z.number().int() }),
  z.object({ type: z.literal("pushSubscribe"), endpoint: z.url().max(1000), p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  z.object({ type: z.literal("pushUnsubscribe"), endpoint: z.url().max(1000) }),
  z.object({ type: z.literal("pushTest") }),
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
  z.object({ type: z.literal("sync"), kind: z.enum(["fixtures", "results", "market", "points", "lineups"]), force: z.boolean().default(false), exclude: z.array(z.string().max(80)).max(20).default([]) }),
]);

export type Action = z.infer<typeof ActionSchema>;

export function formatZodError(e: z.ZodError): string {
  return e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join(" · ");
}

export async function runAction(repo: Store, workspace: Workspace, a: Action): Promise<{ message: string; data?: unknown }> {
  switch (a.type) {
    case "createPlayer": {
      const p = await repo.createManualPlayer({ name: a.name, teamId: a.teamId, position: a.position as never, value: a.value, status: a.status, startProb: a.startProb ?? null });
      return { message: `Jugador ${p.name} creado.`, data: { id: p.id } };
    }
    case "updatePlayer": {
      const { type: _t, playerId: id, ...patch } = a;
      await repo.setOverride(id, patch as never);
      return { message: "Datos del jugador actualizados (edición manual)." };
    }
    case "resetPlayer":
      await repo.clearOverride(a.playerId);
      return { message: "Se han restaurado los datos de la fuente." };
    case "addToSquad":
      await repo.addToSquad({ playerId: a.playerId, purchasePrice: a.purchasePrice, purchaseDate: a.purchaseDate, notes: a.notes ?? null });
      return { message: "Jugador añadido a tu plantilla (sin mover presupuesto)." };
    case "updateSquad":
      await repo.updateSquadEntry(a.playerId, { purchasePrice: a.purchasePrice, purchaseDate: a.purchaseDate, notes: a.notes });
      return { message: "Datos de compra actualizados." };
    case "removeFromSquad":
      await repo.removeFromSquad(a.playerId);
      return { message: "Jugador quitado de la plantilla (sin registrar venta)." };
    case "buy": {
      const r = await repo.buy(a);
      return { message: `Compra registrada. Saldo: ${r.budget.toLocaleString("es-ES")} €.`, data: r };
    }
    case "sell": {
      const r = await repo.sell(a);
      return { message: `Venta registrada (${r.profit >= 0 ? "+" : ""}${r.profit.toLocaleString("es-ES")} € frente a la compra). Saldo: ${r.budget.toLocaleString("es-ES")} €.`, data: r };
    }
    case "setBudget": {
      const r = await repo.setBudget(a.budget, today(), a.notes);
      return { message: `Presupuesto fijado en ${r.budget.toLocaleString("es-ES")} €.`, data: r };
    }
    case "setClause": {
      const r = await repo.setClause({ playerId: a.playerId, clause: a.clause, cost: a.cost, date: a.date, notes: a.notes });
      return { message: a.cost > 0 ? `Cláusula subida a ${a.clause.toLocaleString("es-ES")} €. Saldo: ${r.budget.toLocaleString("es-ES")} €.` : `Cláusula guardada: ${a.clause.toLocaleString("es-ES")} €.`, data: r };
    }
    case "pushSubscribe": {
      if (!pushEnabled()) throw new DomainError("Los avisos no están configurados en el servidor (faltan las claves VAPID).", 503);
      await repo.savePushSubscription({ endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth });
      return { message: "Avisos activados en este dispositivo." };
    }
    case "pushUnsubscribe":
      await repo.deletePushSubscription(a.endpoint);
      return { message: "Avisos desactivados en este dispositivo." };
    case "pushTest": {
      const n = await sendPush(repo, await repo.listPushSubscriptions(), { title: "🔔 Avisos de Fantasy OS activados", body: "Así te llegarán las lesiones, apercibidos y el inicio de cada jornada.", url: "/", tag: "test" });
      if (n === 0) throw new DomainError("No se pudo enviar el aviso de prueba: activa los avisos en este dispositivo.", 422);
      return { message: `Aviso de prueba enviado a ${n} ${n === 1 ? "dispositivo" : "dispositivos"}.` };
    }
    case "deleteTransaction":
      await repo.deleteTransaction(a.id);
      return { message: "Operación eliminada del historial (el saldo no se modifica)." };
    case "saveLineup":
      await repo.saveLineup(a.formation as never, a.useCoach, a.lineup);
      return { message: "Alineación guardada." };
    case "changeFormation": {
      const s = await repo.getSettings();
      const lineup = remapLineup(s.lineup, a.formation as never, a.useCoach);
      await repo.saveSettings({ formation: a.formation as never, useCoach: a.useCoach, lineup });
      return { message: `Formación cambiada a ${a.formation}.` };
    }
    case "applyRecommendedLineup": {
      const st = await buildState(repo, workspace);
      const lineup = Object.fromEntries(st.lineupRec.slots.map((s) => [s.slot, s.playerId]));
      await repo.saveLineup(st.lineupRec.formation, st.settings.useCoach, lineup);
      return { message: `Aplicado el once recomendado (${st.lineupRec.formation}).` };
    }
    case "saveSettings":
      if (a.maxSquadSize != null && a.maxSquadSize < (await repo.getSquad()).length) throw new DomainError("El máximo no puede ser menor que tu plantilla actual.");
      await repo.saveSettings({ teamName: a.teamName, maxSquadSize: a.maxSquadSize });
      return { message: "Ajustes guardados." };
    case "addListing":
      await repo.addListing({ date: a.date ?? today(), playerId: a.playerId, askingPrice: a.askingPrice ?? null, seller: a.seller ?? null });
      return { message: "Jugador añadido al mercado del día." };
    case "removeListing":
      await repo.removeListing(a.id);
      return { message: "Jugador quitado del mercado del día." };
    case "clearListings":
      await repo.clearListings(a.date);
      return { message: "Mercado del día vaciado." };
    case "importListingsCsv":
      return importListings(repo, a.csv, a.date ?? today(), a.createMissing);
    case "upsertLineupEntry":
      await repo.upsertManualLineupEntry({ id: a.id, matchday: a.matchday, teamId: a.teamId, playerName: a.playerName, playerId: a.playerId ?? null, role: a.role, probability: a.probability ?? null });
      if (a.playerId) {
        const st = a.role === "lesionado" ? "lesionado" : a.role === "sancionado" ? "sancionado" : a.role === "duda" ? "duda" : "disponible";
        await repo.updateAvailability([{ id: a.playerId, status: st, startProb: a.probability ?? null, note: "Editado manualmente" }]);
      }
      return { message: "Alineación probable actualizada (edición manual)." };
    case "deleteLineupEntry":
      await repo.deleteLineupEntry(a.id);
      return { message: "Entrada eliminada." };
    case "resetDemo": {
      if (workspace !== "demo") throw new DomainError("Solo se puede regenerar el espacio de demostración.");
      const r = await seedDemo(repo);
      return { message: `Datos de demostración regenerados (${r.players} jugadores ficticios).` };
    }
    case "sync": {
      if (workspace === "demo") throw new DomainError("Estás en modo demostración: la sincronización solo se usa con datos reales.");
      const r = await syncStep(repo, a.kind, { force: a.force, exclude: a.exclude });
      return { message: `${r.kind}: ${r.message}`, data: r };
    }
  }
}

async function importListings(repo: Store, csv: string, date: string, createMissing: boolean) {
  const { headers, rows } = parseCsv(csv);
  if (!headers.some((h) => ["nombre", "jugador", "name"].includes(h))) throw new DomainError("El CSV necesita una columna 'nombre' (o 'jugador').");
  const catalog = await repo.getPlayers();
  let added = 0, created = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const name = pick(row, "nombre", "jugador", "name");
    if (!name) { errors.push(`Línea ${line}: falta el nombre`); continue; }
    const team = resolveTeamId(pick(row, "equipo", "club", "team"));
    const price = parseMoney(pick(row, "precio", "valor", "price", "value") ?? null);
    const seller = pick(row, "vendedor", "seller") ?? null;
    let player = matchPlayer(catalog, team, normalizeName(name));
    if (!player && !team) player = matchPlayer(catalog, null, normalizeName(name));
    if (!player) {
      if (!createMissing) { errors.push(`Línea ${line}: ${name} no está en el catálogo`); continue; }
      const pos = parsePosition(pick(row, "posicion", "pos", "position"));
      if (!pos) { errors.push(`Línea ${line}: ${name} no existe y falta su posición`); continue; }
      try {
        player = await repo.createManualPlayer({ name, teamId: team, position: pos, value: price, status: parseStatus(pick(row, "estado", "status")) ?? "desconocido", startProb: null, source: "csv" });
        catalog.push(player);
        created++;
      } catch (e) {
        errors.push(`Línea ${line}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
    }
    await repo.addListing({ date, playerId: player.id, askingPrice: price, seller });
    added++;
  }
  return {
    message: `${added} jugadores importados al mercado del ${date}${created ? ` (${created} creados como nuevos)` : ""}${errors.length ? `. ${errors.length} con errores.` : "."}`,
    data: { added, created, errors },
  };
}
