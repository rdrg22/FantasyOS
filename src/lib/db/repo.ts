import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { tx } from "./sqlite";
import { DEFAULT_SETTINGS, DomainError, today, type PlayerInput, type PushSubscriptionRow } from "./common";

export { DEFAULT_SETTINGS, DomainError, today, type PlayerInput };
import { normalizeName } from "../domain/normalize";
import { formationSlots } from "../domain/formations";
import type {
  DataSource,
  Fixture,
  LineupRole,
  MarketListing,
  Player,
  PlayerOverride,
  PlayerStatus,
  Position,
  PriceSnapshot,
  ProbableLineupEntry,
  Settings,
  SquadEntry,
  SquadValuePoint,
  SyncLogEntry,
  Transaction,
  TransactionType,
} from "../domain/types";

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const num = (v: unknown): number | null => (v == null ? null : Number(v));

function rowToPlayer(r: Row, ov?: PlayerOverride): Player {
  const p: Player = {
    id: String(r.id),
    name: String(r.name),
    shortName: (r.short_name as string) ?? null,
    normName: String(r.norm_name),
    teamId: (r.team_id as string) ?? null,
    position: r.position as Position,
    status: r.status as PlayerStatus,
    statusNote: (r.status_note as string) ?? null,
    startProb: num(r.start_prob),
    value: num(r.value),
    sourceHistory: r.source_history ? JSON.parse(String(r.source_history)) : null,
    sourceStreakDays: num(r.streak_days),
    sourceAcceleration: num(r.acceleration),
    nextOpponentId: (r.next_opponent_id as string) ?? null,
    nextHome: r.next_home == null ? null : Boolean(r.next_home),
    nextMatchday: num(r.next_matchday),
    pointsTotal: num(r.points_total),
    pointsAvg: num(r.points_avg),
    points5: num(r.points5),
    played5: num(r.played5),
    matchesPlayed: num(r.matches_played),
    lastPoints: num(r.last_points),
    yellowCards: num(r.yellow_cards),
    redCards: num(r.red_cards),
    warned: r.warned == null ? null : Boolean(r.warned),
    source: r.source as DataSource,
    sourceId: (r.source_id as string) ?? null,
    updatedAt: String(r.updated_at),
    overridden: [],
  };
  if (ov) {
    for (const [k, v] of Object.entries(ov) as [keyof PlayerOverride, never][]) {
      if (v === undefined) continue;
      (p as unknown as Record<string, unknown>)[k] = v;
      p.overridden.push(k);
    }
  }
  return p;
}

function rowToSync(r: Row): SyncLogEntry {
  return {
    id: Number(r.id),
    source: String(r.source),
    kind: String(r.kind),
    startedAt: String(r.started_at),
    finishedAt: (r.finished_at as string) ?? null,
    status: r.status as SyncLogEntry["status"],
    message: (r.message as string) ?? null,
    count: num(r.count),
  };
}

export class SqliteRepo {
  constructor(public db: DatabaseSync, public userId: string) {}

  // ───────────────────────── Jugadores ─────────────────────────

  upsertPlayers(players: PlayerInput[]): number {
    const stmt = this.db.prepare(`
      INSERT INTO players (id, name, short_name, norm_name, team_id, position, status, status_note, start_prob, value,
        source_history, streak_days, acceleration, next_opponent_id, next_home, next_matchday, points_total, points_avg,
        points5, played5, matches_played, last_points, source, source_id, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, short_name=COALESCE(excluded.short_name, players.short_name), norm_name=excluded.norm_name,
        team_id=excluded.team_id, position=excluded.position,
        status=CASE WHEN excluded.status = 'desconocido' THEN players.status ELSE excluded.status END,
        status_note=CASE WHEN excluded.status = 'desconocido' THEN players.status_note ELSE excluded.status_note END,
        start_prob=excluded.start_prob, value=COALESCE(excluded.value, players.value),
        source_history=COALESCE(excluded.source_history, players.source_history),
        streak_days=COALESCE(excluded.streak_days, players.streak_days),
        acceleration=COALESCE(excluded.acceleration, players.acceleration),
        next_opponent_id=COALESCE(excluded.next_opponent_id, players.next_opponent_id),
        next_home=COALESCE(excluded.next_home, players.next_home),
        next_matchday=COALESCE(excluded.next_matchday, players.next_matchday),
        points_total=COALESCE(excluded.points_total, players.points_total),
        points_avg=COALESCE(excluded.points_avg, players.points_avg),
        points5=COALESCE(excluded.points5, players.points5),
        played5=COALESCE(excluded.played5, players.played5),
        matches_played=COALESCE(excluded.matches_played, players.matches_played),
        last_points=COALESCE(excluded.last_points, players.last_points),
        source=excluded.source, source_id=excluded.source_id, updated_at=excluded.updated_at
    `);
    return tx(this.db, () => {
      for (const p of players) {
        stmt.run(
          p.id, p.name, p.shortName, p.normName ?? normalizeName(p.name), p.teamId, p.position, p.status, p.statusNote,
          p.startProb, p.value, p.sourceHistory ? JSON.stringify(p.sourceHistory) : null, p.sourceStreakDays,
          p.sourceAcceleration, p.nextOpponentId, p.nextHome == null ? null : p.nextHome ? 1 : 0, p.nextMatchday,
          p.pointsTotal, p.pointsAvg, p.points5, p.played5, p.matchesPlayed, p.lastPoints, p.source, p.sourceId,
          p.updatedAt,
        );
      }
      return players.length;
    });
  }

  /** Actualiza solo campos de rendimiento (puntos) sin tocar el resto. */
  updatePoints(rows: { id: string; pointsTotal: number | null; pointsAvg: number | null; points5: number | null; played5: number | null; matchesPlayed: number | null; lastPoints: number | null }[]): number {
    const stmt = this.db.prepare(
      "UPDATE players SET points_total=?, points_avg=?, points5=?, played5=?, matches_played=?, last_points=? WHERE id=?",
    );
    return tx(this.db, () => {
      let n = 0;
      for (const r of rows) {
        const res = stmt.run(r.pointsTotal, r.pointsAvg, r.points5, r.played5, r.matchesPlayed, r.lastPoints, r.id);
        n += Number(res.changes);
      }
      return n;
    });
  }

  /** Tarjetas de la temporada y apercibidos (no toca el resto de datos). */
  updateDiscipline(rows: { id: string; yellow: number | null; red: number | null; warned: boolean }[]): number {
    const stmt = this.db.prepare("UPDATE players SET yellow_cards=COALESCE(?, yellow_cards), red_cards=COALESCE(?, red_cards), warned=? WHERE id=?");
    return tx(this.db, () => {
      let n = 0;
      for (const r of rows) n += Number(stmt.run(r.yellow, r.red, r.warned ? 1 : 0, r.id).changes);
      return n;
    });
  }

  updateAvailability(rows: { id: string; status: PlayerStatus; startProb: number | null; note: string | null }[]): number {
    const stmt = this.db.prepare("UPDATE players SET status=?, start_prob=COALESCE(?, start_prob), status_note=? WHERE id=?");
    return tx(this.db, () => {
      let n = 0;
      for (const r of rows) n += Number(stmt.run(r.status, r.startProb, r.note, r.id).changes);
      return n;
    });
  }

  private overrides(): Map<string, PlayerOverride> {
    const rows = this.db.prepare("SELECT player_id, data FROM player_overrides WHERE user_id = ?").all(this.userId) as Row[];
    return new Map(rows.map((r) => [String(r.player_id), JSON.parse(String(r.data)) as PlayerOverride]));
  }

  getPlayers(): Player[] {
    const ov = this.overrides();
    const rows = this.db.prepare("SELECT * FROM players ORDER BY value DESC NULLS LAST, name").all() as Row[];
    return rows.map((r) => rowToPlayer(r, ov.get(String(r.id))));
  }

  getPlayer(id: string): Player | null {
    const r = this.db.prepare("SELECT * FROM players WHERE id = ?").get(id) as Row | undefined;
    if (!r) return null;
    return rowToPlayer(r, this.overrides().get(id));
  }

  createManualPlayer(input: { name: string; teamId: string | null; position: Position; value: number | null; status: PlayerStatus; startProb: number | null; source?: DataSource }): Player {
    const norm = normalizeName(input.name);
    const dup = this.db
      .prepare("SELECT id FROM players WHERE norm_name = ? AND (team_id IS ? OR team_id = ?)")
      .get(norm, input.teamId, input.teamId) as Row | undefined;
    if (dup) throw new DomainError(`Ya existe un jugador "${input.name}" en ese equipo.`, 409);
    const id = `${input.source ?? "manual"}:${randomUUID().slice(0, 8)}`;
    this.upsertPlayers([
      {
        id, name: input.name.trim(), shortName: null, normName: norm, teamId: input.teamId, position: input.position,
        status: input.status, statusNote: null, startProb: input.startProb, value: input.value, sourceHistory: null,
        sourceStreakDays: null, sourceAcceleration: null, nextOpponentId: null, nextHome: null, nextMatchday: null,
        pointsTotal: null, pointsAvg: null, points5: null, played5: null, matchesPlayed: null, lastPoints: null,
        source: input.source ?? "manual", sourceId: null, updatedAt: now(),
      },
    ]);
    if (input.value != null) this.recordSnapshots([{ playerId: id, value: input.value }], today(), input.source ?? "manual");
    return this.getPlayer(id)!;
  }

  setOverride(playerId: string, patch: PlayerOverride) {
    if (!this.getPlayer(playerId)) throw new DomainError("Jugador no encontrado", 404);
    const current = this.overrides().get(playerId) ?? {};
    const merged: PlayerOverride = { ...current, ...patch };
    for (const k of Object.keys(merged) as (keyof PlayerOverride)[]) if (merged[k] === undefined) delete merged[k];
    this.db
      .prepare("INSERT OR REPLACE INTO player_overrides (user_id, player_id, data, updated_at) VALUES (?,?,?,?)")
      .run(this.userId, playerId, JSON.stringify(merged), now());
  }

  clearOverride(playerId: string, fields?: (keyof PlayerOverride)[]) {
    if (!fields) {
      this.db.prepare("DELETE FROM player_overrides WHERE user_id=? AND player_id=?").run(this.userId, playerId);
      return;
    }
    const current = this.overrides().get(playerId);
    if (!current) return;
    for (const f of fields) delete current[f];
    this.db
      .prepare("UPDATE player_overrides SET data=?, updated_at=? WHERE user_id=? AND player_id=?")
      .run(JSON.stringify(current), now(), this.userId, playerId);
  }

  /**
   * Sustituye un jugador (p. ej. creado a mano) por otro (p. ej. el de la fuente) en todas
   * las tablas del usuario y elimina el original.
   */
  relinkPlayer(fromId: string, toId: string) {
    if (fromId === toId) return;
    tx(this.db, () => {
      const inSquad = this.db.prepare("SELECT 1 FROM squad WHERE player_id=?").get(toId);
      if (inSquad) this.db.prepare("DELETE FROM squad WHERE player_id=?").run(fromId);
      else this.db.prepare("UPDATE squad SET player_id=? WHERE player_id=?").run(toId, fromId);
      this.db.prepare("UPDATE OR IGNORE market_listings SET player_id=? WHERE player_id=?").run(toId, fromId);
      this.db.prepare("DELETE FROM market_listings WHERE player_id=?").run(fromId);
      this.db.prepare("UPDATE transactions SET player_id=? WHERE player_id=?").run(toId, fromId);
      this.db.prepare("UPDATE probable_lineups SET player_id=? WHERE player_id=?").run(toId, fromId);
      this.db.prepare("UPDATE OR IGNORE player_overrides SET player_id=? WHERE player_id=?").run(toId, fromId);
      this.db.prepare("DELETE FROM player_overrides WHERE player_id=?").run(fromId);
      this.db.prepare("UPDATE OR IGNORE price_snapshots SET player_id=? WHERE player_id=?").run(toId, fromId);
      this.db.prepare("DELETE FROM price_snapshots WHERE player_id=?").run(fromId);
      const rows = this.db.prepare("SELECT user_id, value FROM settings WHERE key='lineup'").all() as Row[];
      for (const r of rows) {
        const l = JSON.parse(String(r.value)) as Record<string, string | null>;
        let ch = false;
        for (const k of Object.keys(l)) if (l[k] === fromId) { l[k] = toId; ch = true; }
        if (ch) this.db.prepare("UPDATE settings SET value=? WHERE user_id=? AND key='lineup'").run(JSON.stringify(l), r.user_id as string);
      }
      this.db.prepare("DELETE FROM players WHERE id=?").run(fromId);
    });
  }

  // ───────────────────────── Históricos de precio ─────────────────────────

  recordSnapshots(entries: { playerId: string; value: number }[], date: string, source: DataSource): number {
    const stmt = this.db.prepare("INSERT OR REPLACE INTO price_snapshots (player_id, date, value, source) VALUES (?,?,?,?)");
    return tx(this.db, () => {
      for (const e of entries) stmt.run(e.playerId, date, e.value, source);
      return entries.length;
    });
  }

  getSnapshots(since?: string): Map<string, PriceSnapshot[]> {
    const rows = (since
      ? this.db.prepare("SELECT * FROM price_snapshots WHERE date >= ? ORDER BY player_id, date").all(since)
      : this.db.prepare("SELECT * FROM price_snapshots ORDER BY player_id, date").all()) as Row[];
    const out = new Map<string, PriceSnapshot[]>();
    for (const r of rows) {
      const s: PriceSnapshot = { playerId: String(r.player_id), date: String(r.date), value: Number(r.value), source: r.source as DataSource };
      const arr = out.get(s.playerId);
      if (arr) arr.push(s);
      else out.set(s.playerId, [s]);
    }
    return out;
  }

  snapshotDays(): number {
    const r = this.db.prepare("SELECT COUNT(DISTINCT date) AS n FROM price_snapshots").get() as Row;
    return Number(r.n);
  }

  // ───────────────────────── Ajustes ─────────────────────────

  getSettings(): Settings {
    const rows = this.db.prepare("SELECT key, value FROM settings WHERE user_id = ?").all(this.userId) as Row[];
    const s: Settings = { ...DEFAULT_SETTINGS, lineup: {} };
    for (const r of rows) (s as unknown as Record<string, unknown>)[String(r.key)] = JSON.parse(String(r.value));
    return s;
  }

  saveSettings(patch: Partial<Settings>) {
    const stmt = this.db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?,?,?)");
    tx(this.db, () => {
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(this.userId, k, JSON.stringify(v));
    });
  }

  hasSettings(): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM settings WHERE user_id = ? LIMIT 1").get(this.userId));
  }

  // ───────────────────────── Plantilla y operaciones ─────────────────────────

  getSquad(): SquadEntry[] {
    const rows = this.db.prepare("SELECT * FROM squad WHERE user_id = ? ORDER BY purchase_date").all(this.userId) as Row[];
    return rows.map((r) => ({
      playerId: String(r.player_id),
      purchasePrice: Number(r.purchase_price),
      purchaseDate: String(r.purchase_date),
      notes: (r.notes as string) ?? null,
      clause: num(r.clause),
    }));
  }

  /** Añade un jugador que ya tenías (sin mover dinero). */
  addToSquad(e: SquadEntry) {
    if (!this.getPlayer(e.playerId)) throw new DomainError("Jugador no encontrado", 404);
    const s = this.getSettings();
    if (this.getSquad().length >= s.maxSquadSize) throw new DomainError(`La plantilla ya tiene ${s.maxSquadSize} jugadores (máximo configurado).`);
    const exists = this.db.prepare("SELECT 1 FROM squad WHERE user_id=? AND player_id=?").get(this.userId, e.playerId);
    if (exists) throw new DomainError("Ese jugador ya está en tu plantilla.", 409);
    this.db
      .prepare("INSERT INTO squad (user_id, player_id, purchase_price, purchase_date, notes) VALUES (?,?,?,?,?)")
      .run(this.userId, e.playerId, e.purchasePrice, e.purchaseDate, e.notes);
  }

  /** Solo para cargas de datos (demo/importación): sin validaciones de negocio. */
  addToSquadUnchecked(playerId: string, purchasePrice: number, purchaseDate: string) {
    this.db
      .prepare("INSERT OR REPLACE INTO squad (user_id, player_id, purchase_price, purchase_date, notes) VALUES (?,?,?,?,NULL)")
      .run(this.userId, playerId, purchasePrice, purchaseDate);
  }

  updateSquadEntry(playerId: string, patch: { purchasePrice?: number; purchaseDate?: string; notes?: string | null }) {
    const cur = this.getSquad().find((s) => s.playerId === playerId);
    if (!cur) throw new DomainError("Ese jugador no está en tu plantilla.", 404);
    this.db
      .prepare("UPDATE squad SET purchase_price=?, purchase_date=?, notes=? WHERE user_id=? AND player_id=?")
      .run(patch.purchasePrice ?? cur.purchasePrice, patch.purchaseDate ?? cur.purchaseDate, patch.notes === undefined ? cur.notes : patch.notes, this.userId, playerId);
  }

  /** Quita de la plantilla sin registrar venta (corrección de datos). */
  removeFromSquad(playerId: string) {
    tx(this.db, () => {
      this.db.prepare("DELETE FROM squad WHERE user_id=? AND player_id=?").run(this.userId, playerId);
      this.dropFromLineup(playerId);
    });
  }

  private dropFromLineup(playerId: string) {
    const s = this.getSettings();
    let changed = false;
    for (const k of Object.keys(s.lineup)) if (s.lineup[k] === playerId) { s.lineup[k] = null; changed = true; }
    if (changed) this.saveSettingsRaw("lineup", s.lineup);
  }

  private saveSettingsRaw(key: string, value: unknown) {
    this.db.prepare("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?,?,?)").run(this.userId, key, JSON.stringify(value));
  }

  private insertTx(type: TransactionType, playerId: string | null, playerName: string, amount: number, date: string, notes: string | null, costBasis: number | null = null) {
    this.db
      .prepare("INSERT INTO transactions (user_id, type, player_id, player_name, amount, cost_basis, date, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(this.userId, type, playerId, playerName, amount, costBasis, date, notes, now());
  }

  /** Compra: descuenta del presupuesto y añade a la plantilla, de forma atómica. */
  buy(input: { playerId: string; price: number; date: string; notes?: string | null; allowNegative?: boolean }) {
    const player = this.getPlayer(input.playerId);
    if (!player) throw new DomainError("Jugador no encontrado", 404);
    if (input.price <= 0) throw new DomainError("El precio debe ser mayor que cero.");
    return tx(this.db, () => {
      const s = this.getSettings();
      const squad = this.getSquad();
      if (squad.some((x) => x.playerId === input.playerId)) throw new DomainError("Ese jugador ya está en tu plantilla.", 409);
      if (squad.length >= s.maxSquadSize) throw new DomainError(`Plantilla completa (${s.maxSquadSize}).`);
      const after = s.budget - input.price;
      if (after < 0 && !input.allowNegative) {
        throw new DomainError(`Presupuesto insuficiente: te faltan ${Math.abs(after).toLocaleString("es-ES")} €.`, 422);
      }
      this.db
        .prepare("INSERT INTO squad (user_id, player_id, purchase_price, purchase_date, notes) VALUES (?,?,?,?,?)")
        .run(this.userId, input.playerId, input.price, input.date, input.notes ?? null);
      this.insertTx("compra", input.playerId, player.name, input.price, input.date, input.notes ?? null);
      this.saveSettingsRaw("budget", after);
      this.db.prepare("DELETE FROM market_listings WHERE user_id=? AND player_id=?").run(this.userId, input.playerId);
      return { budget: after };
    });
  }

  /** Venta: suma al presupuesto, quita de plantilla y del once. */
  sell(input: { playerId: string; price: number; date: string; notes?: string | null }) {
    const player = this.getPlayer(input.playerId);
    if (!player) throw new DomainError("Jugador no encontrado", 404);
    if (input.price < 0) throw new DomainError("El precio de venta no puede ser negativo.");
    return tx(this.db, () => {
      const s = this.getSettings();
      const entry = this.getSquad().find((x) => x.playerId === input.playerId);
      if (!entry) throw new DomainError("Ese jugador no está en tu plantilla.", 404);
      this.db.prepare("DELETE FROM squad WHERE user_id=? AND player_id=?").run(this.userId, input.playerId);
      this.insertTx("venta", input.playerId, player.name, input.price, input.date, input.notes ?? null, entry.purchasePrice);
      const after = s.budget + input.price;
      this.saveSettingsRaw("budget", after);
      this.dropFromLineup(input.playerId);
      return { budget: after, profit: input.price - entry.purchasePrice };
    });
  }

  /** Cambia la cláusula de un jugador tuyo; si has pagado por subirla, se descuenta del saldo. */
  setClause(input: { playerId: string; clause: number; cost: number; date: string; notes?: string | null }) {
    if (input.clause <= 0) throw new DomainError("La cláusula debe ser mayor que cero.");
    if (input.cost < 0) throw new DomainError("El coste no puede ser negativo.");
    return tx(this.db, () => {
      const s = this.getSettings();
      const player = this.getPlayer(input.playerId);
      if (!player || !this.getSquad().some((x) => x.playerId === input.playerId)) throw new DomainError("Ese jugador no está en tu plantilla.", 404);
      const after = s.budget - input.cost;
      if (input.cost > 0 && after < 0) throw new DomainError(`Presupuesto insuficiente: te faltan ${Math.abs(after).toLocaleString("es-ES")} €.`, 422);
      this.db.prepare("UPDATE squad SET clause=? WHERE user_id=? AND player_id=?").run(input.clause, this.userId, input.playerId);
      if (input.cost > 0) {
        this.insertTx("clausula", input.playerId, player.name, input.cost, input.date, input.notes ?? null);
        this.saveSettingsRaw("budget", after);
      }
      return { budget: after };
    });
  }

  /** Fija el presupuesto y deja constancia del ajuste. */
  setBudget(budget: number, date: string, notes?: string | null) {
    return tx(this.db, () => {
      const s = this.getSettings();
      const diff = budget - s.budget;
      if (diff !== 0) this.insertTx("ajuste", null, diff > 0 ? "Ajuste de saldo (+)" : "Ajuste de saldo (−)", Math.abs(diff), date, notes ?? null);
      this.saveSettingsRaw("budget", budget);
      return { budget, diff };
    });
  }

  getTransactions(): Transaction[] {
    const rows = this.db.prepare("SELECT * FROM transactions WHERE user_id=? ORDER BY date DESC, id DESC").all(this.userId) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      type: r.type as TransactionType,
      playerId: (r.player_id as string) ?? null,
      playerName: String(r.player_name),
      amount: Number(r.amount),
      costBasis: num(r.cost_basis),
      date: String(r.date),
      notes: (r.notes as string) ?? null,
    }));
  }

  /** Borra una operación del registro sin deshacer su efecto (solo corrección del historial). */
  deleteTransaction(id: number) {
    this.db.prepare("DELETE FROM transactions WHERE user_id=? AND id=?").run(this.userId, id);
  }

  saveLineup(formation: Settings["formation"], useCoach: boolean, lineup: Record<string, string | null>) {
    const squadIds = new Set(this.getSquad().map((s) => s.playerId));
    const valid = new Set(formationSlots(formation, useCoach).map((s) => s.slot));
    const seen = new Set<string>();
    const clean: Record<string, string | null> = {};
    for (const slot of valid) {
      const pid = lineup[slot] ?? null;
      if (pid && (!squadIds.has(pid) || seen.has(pid))) throw new DomainError("La alineación contiene jugadores repetidos o que no están en tu plantilla.");
      if (pid) {
        const p = this.getPlayer(pid);
        if (p && p.position !== slot.split("-")[0]) throw new DomainError(`${p.name} no puede jugar en el hueco ${slot}.`);
        seen.add(pid);
      }
      clean[slot] = pid;
    }
    this.saveSettings({ formation, useCoach, lineup: clean });
    return clean;
  }

  // ───────────────────────── Mercado diario del usuario ─────────────────────────

  getListings(date?: string): MarketListing[] {
    const rows = (date
      ? this.db.prepare("SELECT * FROM market_listings WHERE user_id=? AND date=? ORDER BY id").all(this.userId, date)
      : this.db.prepare("SELECT * FROM market_listings WHERE user_id=? ORDER BY date DESC, id").all(this.userId)) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      date: String(r.date),
      playerId: String(r.player_id),
      askingPrice: num(r.asking_price),
      seller: (r.seller as string) ?? null,
    }));
  }

  latestListingDate(): string | null {
    const r = this.db.prepare("SELECT MAX(date) AS d FROM market_listings WHERE user_id=?").get(this.userId) as Row;
    return (r?.d as string) ?? null;
  }

  addListing(l: { date: string; playerId: string; askingPrice: number | null; seller: string | null }) {
    if (!this.getPlayer(l.playerId)) throw new DomainError("Jugador no encontrado", 404);
    this.db
      .prepare(`INSERT INTO market_listings (user_id, date, player_id, asking_price, seller) VALUES (?,?,?,?,?)
                ON CONFLICT(user_id, date, player_id) DO UPDATE SET asking_price=excluded.asking_price, seller=excluded.seller`)
      .run(this.userId, l.date, l.playerId, l.askingPrice, l.seller);
  }

  removeListing(id: number) {
    this.db.prepare("DELETE FROM market_listings WHERE user_id=? AND id=?").run(this.userId, id);
  }

  clearListings(date: string) {
    this.db.prepare("DELETE FROM market_listings WHERE user_id=? AND date=?").run(this.userId, date);
  }

  // ───────────────────────── Notificaciones push ─────────────────────────

  savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
    this.db
      .prepare(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`)
      .run(sub.endpoint, this.userId, sub.p256dh, sub.auth, now());
  }

  deletePushSubscription(endpoint: string) {
    this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").run(endpoint);
  }

  /** Suscripciones de este usuario, o de todos con `all` (solo para el envío programado). */
  listPushSubscriptions(all = false): PushSubscriptionRow[] {
    const rows = (all
      ? this.db.prepare("SELECT * FROM push_subscriptions").all()
      : this.db.prepare("SELECT * FROM push_subscriptions WHERE user_id=?").all(this.userId)) as Row[];
    return rows.map((r) => ({ userId: String(r.user_id), endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth) }));
  }

  getNotifyState(): Map<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM notify_state WHERE user_id=?").all(this.userId) as Row[];
    return new Map(rows.map((r) => [String(r.key), String(r.value)]));
  }

  setNotifyState(entries: [string, string][]) {
    const stmt = this.db.prepare(`INSERT INTO notify_state (user_id, key, value, updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`);
    tx(this.db, () => {
      for (const [k, v] of entries) stmt.run(this.userId, k, v, now());
    });
  }

  // ───────────────────────── Puntos por jornada ─────────────────────────

  saveMatchdayPoints(matchday: number, rows: { playerId: string; points: number }[]): number {
    const stmt = this.db.prepare(`
      INSERT INTO matchday_points (matchday, player_id, points, updated_at) VALUES (?,?,?,?)
      ON CONFLICT(matchday, player_id) DO UPDATE SET points=excluded.points, updated_at=excluded.updated_at`);
    const now = new Date().toISOString();
    return tx(this.db, () => {
      for (const r of rows) stmt.run(matchday, r.playerId, r.points, now);
      return rows.length;
    });
  }

  getMatchdayPoints(matchday: number): { playerId: string; points: number }[] {
    return (this.db.prepare("SELECT player_id, points FROM matchday_points WHERE matchday = ?").all(matchday) as Row[]).map((r) => ({
      playerId: String(r.player_id),
      points: Number(r.points),
    }));
  }

  /** Jornadas con puntos guardados, en orden ascendente. */
  pointsMatchdays(): number[] {
    return (this.db.prepare("SELECT DISTINCT matchday FROM matchday_points ORDER BY matchday").all() as Row[]).map((r) => Number(r.matchday));
  }

  // ───────────────────────── Calendario ─────────────────────────

  upsertFixtures(fx: Fixture[]): number {
    const stmt = this.db.prepare(`
      INSERT INTO fixtures (id, season, matchday, kickoff, date, home_id, away_id, home_score, away_score, source, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET matchday=excluded.matchday, kickoff=COALESCE(excluded.kickoff, fixtures.kickoff),
        date=excluded.date, home_score=COALESCE(excluded.home_score, fixtures.home_score), away_score=COALESCE(excluded.away_score, fixtures.away_score), source=excluded.source,
        updated_at=excluded.updated_at`);
    return tx(this.db, () => {
      for (const f of fx) stmt.run(f.id, f.season, f.matchday, f.kickoff, f.date, f.homeId, f.awayId, f.homeScore, f.awayScore, f.source, f.updatedAt);
      return fx.length;
    });
  }

  getFixtures(): Fixture[] {
    const rows = this.db.prepare("SELECT * FROM fixtures ORDER BY matchday, date, kickoff").all() as Row[];
    return rows.map((r) => ({
      id: String(r.id),
      season: String(r.season),
      matchday: Number(r.matchday),
      kickoff: (r.kickoff as string) ?? null,
      date: String(r.date),
      homeId: String(r.home_id),
      awayId: String(r.away_id),
      homeScore: num(r.home_score),
      awayScore: num(r.away_score),
      source: r.source as DataSource,
      updatedAt: String(r.updated_at),
    }));
  }

  // ───────────────────────── Alineaciones probables ─────────────────────────

  getLineups(matchday?: number): ProbableLineupEntry[] {
    const rows = (matchday != null
      ? this.db.prepare("SELECT * FROM probable_lineups WHERE matchday=? ORDER BY team_id, role, probability DESC").all(matchday)
      : this.db.prepare("SELECT * FROM probable_lineups ORDER BY matchday, team_id").all()) as Row[];
    return rows.map((r) => ({
      id: Number(r.id),
      matchday: Number(r.matchday),
      teamId: String(r.team_id),
      playerName: String(r.player_name),
      playerId: (r.player_id as string) ?? null,
      role: r.role as LineupRole,
      probability: num(r.probability),
      source: r.source as DataSource,
      updatedAt: String(r.updated_at),
      manual: Boolean(r.manual),
    }));
  }

  /** Sustituye las entradas importadas de un equipo y jornada; respeta las ediciones manuales. */
  replaceImportedLineup(matchday: number, teamId: string, entries: Omit<ProbableLineupEntry, "id" | "manual" | "matchday" | "teamId">[]) {
    tx(this.db, () => {
      this.db.prepare("DELETE FROM probable_lineups WHERE matchday=? AND team_id=? AND manual=0").run(matchday, teamId);
      const manualNames = new Set(
        (this.db.prepare("SELECT player_name FROM probable_lineups WHERE matchday=? AND team_id=? AND manual=1").all(matchday, teamId) as Row[]).map((r) =>
          normalizeName(String(r.player_name)),
        ),
      );
      const stmt = this.db.prepare(
        "INSERT INTO probable_lineups (matchday, team_id, player_name, player_id, role, probability, source, updated_at, manual) VALUES (?,?,?,?,?,?,?,?,0)",
      );
      for (const e of entries) {
        if (manualNames.has(normalizeName(e.playerName))) continue;
        stmt.run(matchday, teamId, e.playerName, e.playerId, e.role, e.probability, e.source, e.updatedAt);
      }
    });
  }

  upsertManualLineupEntry(e: { id?: number; matchday: number; teamId: string; playerName: string; playerId: string | null; role: LineupRole; probability: number | null }) {
    tx(this.db, () => {
      if (e.id) this.db.prepare("DELETE FROM probable_lineups WHERE id=?").run(e.id);
      this.db
        .prepare("DELETE FROM probable_lineups WHERE matchday=? AND team_id=? AND player_name=?")
        .run(e.matchday, e.teamId, e.playerName);
      this.db
        .prepare(
          "INSERT INTO probable_lineups (matchday, team_id, player_name, player_id, role, probability, source, updated_at, manual) VALUES (?,?,?,?,?,?,'manual',?,1)",
        )
        .run(e.matchday, e.teamId, e.playerName, e.playerId, e.role, e.probability, now());
    });
  }

  deleteLineupEntry(id: number) {
    this.db.prepare("DELETE FROM probable_lineups WHERE id=?").run(id);
  }

  // ───────────────────────── Evolución de la plantilla ─────────────────────────

  recordSquadValue(date: string, squadValue: number, budget: number) {
    this.db
      .prepare("INSERT OR REPLACE INTO squad_value_history (user_id, date, squad_value, budget) VALUES (?,?,?,?)")
      .run(this.userId, date, squadValue, budget);
  }

  getSquadValueHistory(): SquadValuePoint[] {
    const rows = this.db.prepare("SELECT * FROM squad_value_history WHERE user_id=? ORDER BY date").all(this.userId) as Row[];
    return rows.map((r) => ({ date: String(r.date), squadValue: Number(r.squad_value), budget: Number(r.budget) }));
  }

  // ───────────────────────── Registro de sincronizaciones ─────────────────────────

  startSync(source: string, kind: string): number {
    const r = this.db
      .prepare("INSERT INTO sync_log (source, kind, started_at, status) VALUES (?,?,?,'running')")
      .run(source, kind, now());
    return Number(r.lastInsertRowid);
  }

  finishSync(id: number, status: SyncLogEntry["status"], message: string | null, count: number | null) {
    this.db.prepare("UPDATE sync_log SET finished_at=?, status=?, message=?, count=? WHERE id=?").run(now(), status, message, count, id);
  }

  getSyncLog(limit = 30): SyncLogEntry[] {
    const rows = this.db.prepare("SELECT * FROM sync_log ORDER BY id DESC LIMIT ?").all(limit) as Row[];
    return rows.map(rowToSync);
  }

  lastSync(source: string, kind: string, status: SyncLogEntry["status"] = "ok"): SyncLogEntry | null {
    const r = this.db
      .prepare("SELECT * FROM sync_log WHERE source=? AND kind=? AND status=? ORDER BY id DESC LIMIT 1")
      .get(source, kind, status) as Row | undefined;
    return r ? rowToSync(r) : null;
  }

  // ───────────────────────── Utilidades de carga ─────────────────────────

  /** Vacía el espacio de trabajo (cada espacio es un archivo distinto en SQLite). */
  resetWorkspace() {
    this.db.exec(`DELETE FROM players; DELETE FROM player_overrides; DELETE FROM price_snapshots; DELETE FROM squad; DELETE FROM transactions;
      DELETE FROM market_listings; DELETE FROM fixtures; DELETE FROM probable_lineups; DELETE FROM settings;
      DELETE FROM squad_value_history; DELETE FROM sync_log; DELETE FROM matchday_points;`);
  }

  /** Inserta una operación histórica sin mover el saldo (solo para cargas de datos). */
  insertTransactionRaw(t: { type: TransactionType; playerId: string | null; playerName: string; amount: number; costBasis: number | null; date: string; notes: string | null }) {
    this.insertTx(t.type, t.playerId, t.playerName, t.amount, t.date, t.notes, t.costBasis);
  }

  /** Usuarios con datos (para la sincronización diaria). */
  listUserIds(): string[] {
    return (this.db.prepare("SELECT DISTINCT user_id FROM squad UNION SELECT DISTINCT user_id FROM settings").all() as Row[]).map((r) => String(r.user_id));
  }
}


