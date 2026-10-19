import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, DomainError, today, type PlayerInput, type Store } from "./common";
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
  Workspace,
} from "../domain/types";

/**
 * Almacén en Supabase (Postgres). Solo se usa en el servidor con la clave secreta;
 * TODAS las consultas de datos de usuario filtran por user_id y ws.
 * Las operaciones de dinero y las escrituras masivas son funciones SQL atómicas (supabase/migrations).
 */

type Row = Record<string, unknown>;
const PAGE = 1000;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (v: unknown): string | null => (v == null ? null : new Date(String(v)).toISOString());
const nowIso = () => new Date().toISOString();

function fail(error: { message: string; code?: string } | null, what: string): void {
  if (!error) return;
  const m = error.message.match(/^FOS:(\d{3}):(.*)$/s);
  if (m) throw new DomainError(m[2], Number(m[1]));
  throw new Error(`Supabase (${what}): ${error.message}`);
}

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
    sourceHistory: (r.source_history as Player["sourceHistory"]) ?? null,
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
    source: r.source as DataSource,
    sourceId: (r.source_id as string) ?? null,
    updatedAt: iso(r.updated_at) ?? nowIso(),
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
    startedAt: iso(r.started_at)!,
    finishedAt: iso(r.finished_at),
    status: r.status as SyncLogEntry["status"],
    message: (r.message as string) ?? null,
    count: num(r.count),
  };
}

function rowToFixture(r: Row): Fixture {
  return {
    id: String(r.id),
    season: String(r.season),
    matchday: Number(r.matchday),
    kickoff: iso(r.kickoff),
    date: String(r.date),
    homeId: String(r.home_id),
    awayId: String(r.away_id),
    homeScore: num(r.home_score),
    awayScore: num(r.away_score),
    source: r.source as DataSource,
    updatedAt: iso(r.updated_at)!,
  };
}

function rowToLineup(r: Row): ProbableLineupEntry {
  return {
    id: Number(r.id),
    matchday: Number(r.matchday),
    teamId: String(r.team_id),
    playerName: String(r.player_name),
    playerId: (r.player_id as string) ?? null,
    role: r.role as LineupRole,
    probability: num(r.probability),
    source: r.source as DataSource,
    updatedAt: iso(r.updated_at)!,
    manual: Boolean(r.manual),
  };
}

function playerToRow(p: PlayerInput) {
  return {
    id: p.id,
    name: p.name,
    short_name: p.shortName,
    norm_name: p.normName ?? normalizeName(p.name),
    team_id: p.teamId,
    position: p.position,
    status: p.status,
    status_note: p.statusNote,
    start_prob: p.startProb,
    value: p.value,
    source_history: p.sourceHistory,
    streak_days: p.sourceStreakDays,
    acceleration: p.sourceAcceleration,
    next_opponent_id: p.nextOpponentId,
    next_home: p.nextHome,
    next_matchday: p.nextMatchday,
    points_total: p.pointsTotal,
    points_avg: p.pointsAvg,
    points5: p.points5,
    played5: p.played5,
    matches_played: p.matchesPlayed,
    last_points: p.lastPoints,
    source: p.source,
    source_id: p.sourceId,
    updated_at: p.updatedAt,
  };
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private sb: SupabaseClient, readonly userId: string, private ws: Workspace) {}

  private async rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    fail(error, fn);
    return data as T;
  }

  /** Lee todas las filas paginando (PostgREST devuelve como máximo 1000 por petición). */
  private async all(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(from, from + PAGE - 1);
      fail(error, what);
      const rows = (data as Row[]) ?? [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  // ───────────────────────── Jugadores ─────────────────────────

  async upsertPlayers(players: PlayerInput[]): Promise<number> {
    let n = 0;
    for (const c of chunks(players, 400)) n += await this.rpc<number>("fos_upsert_players", { p_ws: this.ws, p_rows: c.map(playerToRow) });
    return n;
  }

  async updatePoints(rows: { id: string; pointsTotal: number | null; pointsAvg: number | null; points5: number | null; played5: number | null; matchesPlayed: number | null; lastPoints: number | null }[]): Promise<number> {
    const payload = rows.map((r) => ({ id: r.id, points_total: r.pointsTotal, points_avg: r.pointsAvg, points5: r.points5, played5: r.played5, matches_played: r.matchesPlayed, last_points: r.lastPoints }));
    let n = 0;
    for (const c of chunks(payload, 500)) n += await this.rpc<number>("fos_update_points", { p_rows: c });
    return n;
  }

  async updateAvailability(rows: { id: string; status: PlayerStatus; startProb: number | null; note: string | null }[]): Promise<number> {
    if (!rows.length) return 0;
    return this.rpc<number>("fos_update_availability", { p_rows: rows.map((r) => ({ id: r.id, status: r.status, start_prob: r.startProb, note: r.note })) });
  }

  private async overrides(): Promise<Map<string, PlayerOverride>> {
    const rows = await this.all((a, b) => this.sb.from("player_overrides").select("player_id,data").eq("user_id", this.userId).eq("ws", this.ws).range(a, b), "overrides");
    return new Map(rows.map((r) => [String(r.player_id), r.data as PlayerOverride]));
  }

  async getPlayers(): Promise<Player[]> {
    const [rows, ov] = await Promise.all([
      this.all((a, b) => this.sb.from("players").select("*").eq("ws", this.ws).order("value", { ascending: false, nullsFirst: false }).order("id").range(a, b), "players"),
      this.overrides(),
    ]);
    return rows.map((r) => rowToPlayer(r, ov.get(String(r.id))));
  }

  async getPlayer(id: string): Promise<Player | null> {
    const { data, error } = await this.sb.from("players").select("*").eq("id", id).eq("ws", this.ws).maybeSingle();
    fail(error, "player");
    if (!data) return null;
    const { data: ov } = await this.sb.from("player_overrides").select("data").eq("user_id", this.userId).eq("ws", this.ws).eq("player_id", id).maybeSingle();
    return rowToPlayer(data as Row, (ov?.data as PlayerOverride) ?? undefined);
  }

  async createManualPlayer(input: { name: string; teamId: string | null; position: Position; value: number | null; status: PlayerStatus; startProb: number | null; source?: DataSource }): Promise<Player> {
    const norm = normalizeName(input.name);
    let q = this.sb.from("players").select("id").eq("ws", this.ws).eq("norm_name", norm);
    q = input.teamId ? q.eq("team_id", input.teamId) : q.is("team_id", null);
    const { data: dup, error } = await q.limit(1);
    fail(error, "players");
    if (dup && dup.length) throw new DomainError(`Ya existe un jugador "${input.name}" en ese equipo.`, 409);
    const source = input.source ?? "manual";
    const id = `${source}:${randomUUID().slice(0, 8)}`;
    await this.upsertPlayers([
      {
        id, name: input.name.trim(), shortName: null, normName: norm, teamId: input.teamId, position: input.position,
        status: input.status, statusNote: null, startProb: input.startProb, value: input.value, sourceHistory: null,
        sourceStreakDays: null, sourceAcceleration: null, nextOpponentId: null, nextHome: null, nextMatchday: null,
        pointsTotal: null, pointsAvg: null, points5: null, played5: null, matchesPlayed: null, lastPoints: null,
        source, sourceId: null, updatedAt: nowIso(),
      },
    ]);
    if (input.value != null) await this.recordSnapshots([{ playerId: id, value: input.value }], today(), source);
    return (await this.getPlayer(id))!;
  }

  async setOverride(playerId: string, patch: PlayerOverride): Promise<void> {
    if (!(await this.getPlayer(playerId))) throw new DomainError("Jugador no encontrado", 404);
    const current = (await this.overrides()).get(playerId) ?? {};
    const merged: PlayerOverride = { ...current, ...patch };
    for (const k of Object.keys(merged) as (keyof PlayerOverride)[]) if (merged[k] === undefined) delete merged[k];
    const { error } = await this.sb.from("player_overrides").upsert({ user_id: this.userId, ws: this.ws, player_id: playerId, data: merged, updated_at: nowIso() });
    fail(error, "overrides");
  }

  async clearOverride(playerId: string, fields?: (keyof PlayerOverride)[]): Promise<void> {
    const base = this.sb.from("player_overrides");
    if (!fields) {
      const { error } = await base.delete().eq("user_id", this.userId).eq("ws", this.ws).eq("player_id", playerId);
      fail(error, "overrides");
      return;
    }
    const current = (await this.overrides()).get(playerId);
    if (!current) return;
    for (const f of fields) delete current[f];
    const { error } = await base.update({ data: current, updated_at: nowIso() }).eq("user_id", this.userId).eq("ws", this.ws).eq("player_id", playerId);
    fail(error, "overrides");
  }

  async relinkPlayer(fromId: string, toId: string): Promise<void> {
    await this.rpc("fos_relink_player", { p_from: fromId, p_to: toId });
  }

  // ───────────────────────── Históricos de precio ─────────────────────────

  async recordSnapshots(entries: { playerId: string; value: number }[], date: string, source: DataSource): Promise<number> {
    for (const c of chunks(entries, 500)) {
      const { error } = await this.sb.from("price_snapshots").upsert(c.map((e) => ({ player_id: e.playerId, date, ws: this.ws, value: e.value, source })));
      fail(error, "snapshots");
    }
    return entries.length;
  }

  async getSnapshots(since?: string): Promise<Map<string, PriceSnapshot[]>> {
    const rows = await this.all((a, b) => this.sb.rpc("fos_recent_snapshots", { p_ws: this.ws, p_since: since ?? "1900-01-01" }).range(a, b), "snapshots");
    const out = new Map<string, PriceSnapshot[]>();
    for (const r of rows) {
      const dates = r.dates as string[];
      const vals = r.vals as number[];
      out.set(String(r.player_id), dates.map((d, i) => ({ playerId: String(r.player_id), date: d, value: Number(vals[i]), source: "futbolfantasy" as DataSource })));
    }
    return out;
  }

  async snapshotDays(): Promise<number> {
    return this.rpc<number>("fos_snapshot_days", { p_ws: this.ws });
  }

  // ───────────────────────── Ajustes ─────────────────────────

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.sb.from("settings").select("key,value").eq("user_id", this.userId).eq("ws", this.ws);
    fail(error, "settings");
    const s: Settings = { ...DEFAULT_SETTINGS, lineup: {} };
    for (const r of (data as Row[]) ?? []) (s as unknown as Record<string, unknown>)[String(r.key)] = r.value;
    return s;
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const rows = Object.entries(patch).filter(([, v]) => v !== undefined).map(([key, value]) => ({ user_id: this.userId, ws: this.ws, key, value }));
    if (!rows.length) return;
    const { error } = await this.sb.from("settings").upsert(rows);
    fail(error, "settings");
  }

  async hasSettings(): Promise<boolean> {
    const { count, error } = await this.sb.from("settings").select("key", { count: "exact", head: true }).eq("user_id", this.userId).eq("ws", this.ws);
    fail(error, "settings");
    return (count ?? 0) > 0;
  }

  // ───────────────────────── Plantilla y operaciones ─────────────────────────

  async getSquad(): Promise<SquadEntry[]> {
    const { data, error } = await this.sb.from("squad").select("*").eq("user_id", this.userId).eq("ws", this.ws).order("purchase_date");
    fail(error, "squad");
    return ((data as Row[]) ?? []).map((r) => ({ playerId: String(r.player_id), purchasePrice: Number(r.purchase_price), purchaseDate: String(r.purchase_date), notes: (r.notes as string) ?? null }));
  }

  async addToSquad(e: SquadEntry): Promise<void> {
    if (!(await this.getPlayer(e.playerId))) throw new DomainError("Jugador no encontrado", 404);
    const [s, squad] = await Promise.all([this.getSettings(), this.getSquad()]);
    if (squad.length >= s.maxSquadSize) throw new DomainError(`La plantilla ya tiene ${s.maxSquadSize} jugadores (máximo configurado).`);
    if (squad.some((x) => x.playerId === e.playerId)) throw new DomainError("Ese jugador ya está en tu plantilla.", 409);
    const { error } = await this.sb.from("squad").insert({ user_id: this.userId, ws: this.ws, player_id: e.playerId, purchase_price: e.purchasePrice, purchase_date: e.purchaseDate, notes: e.notes });
    fail(error, "squad");
  }

  async addToSquadUnchecked(playerId: string, purchasePrice: number, purchaseDate: string): Promise<void> {
    const { error } = await this.sb.from("squad").upsert({ user_id: this.userId, ws: this.ws, player_id: playerId, purchase_price: purchasePrice, purchase_date: purchaseDate, notes: null });
    fail(error, "squad");
  }

  async updateSquadEntry(playerId: string, patch: { purchasePrice?: number; purchaseDate?: string; notes?: string | null }): Promise<void> {
    const cur = (await this.getSquad()).find((s) => s.playerId === playerId);
    if (!cur) throw new DomainError("Ese jugador no está en tu plantilla.", 404);
    const { error } = await this.sb
      .from("squad")
      .update({ purchase_price: patch.purchasePrice ?? cur.purchasePrice, purchase_date: patch.purchaseDate ?? cur.purchaseDate, notes: patch.notes === undefined ? cur.notes : patch.notes })
      .eq("user_id", this.userId).eq("ws", this.ws).eq("player_id", playerId);
    fail(error, "squad");
  }

  async removeFromSquad(playerId: string): Promise<void> {
    const { error } = await this.sb.from("squad").delete().eq("user_id", this.userId).eq("ws", this.ws).eq("player_id", playerId);
    fail(error, "squad");
    await this.rpc("fos_drop_from_lineup", { p_user: this.userId, p_ws: this.ws, p_player: playerId });
  }

  async buy(input: { playerId: string; price: number; date: string; notes?: string | null; allowNegative?: boolean }): Promise<{ budget: number }> {
    if (!(await this.getPlayer(input.playerId))) throw new DomainError("Jugador no encontrado", 404);
    const r = await this.rpc<{ budget: number }>("fos_buy", {
      p_user: this.userId, p_ws: this.ws, p_player: input.playerId, p_price: input.price, p_date: input.date, p_notes: input.notes ?? null, p_allow_negative: input.allowNegative ?? false,
    });
    return { budget: Number(r.budget) };
  }

  async sell(input: { playerId: string; price: number; date: string; notes?: string | null }): Promise<{ budget: number; profit: number }> {
    if (!(await this.getPlayer(input.playerId))) throw new DomainError("Jugador no encontrado", 404);
    const r = await this.rpc<{ budget: number; profit: number }>("fos_sell", { p_user: this.userId, p_ws: this.ws, p_player: input.playerId, p_price: input.price, p_date: input.date, p_notes: input.notes ?? null });
    return { budget: Number(r.budget), profit: Number(r.profit) };
  }

  async setBudget(budget: number, date: string, notes?: string | null): Promise<{ budget: number; diff: number }> {
    const r = await this.rpc<{ budget: number; diff: number }>("fos_set_budget", { p_user: this.userId, p_ws: this.ws, p_budget: budget, p_date: date, p_notes: notes ?? null });
    return { budget: Number(r.budget), diff: Number(r.diff) };
  }

  async getTransactions(): Promise<Transaction[]> {
    const rows = await this.all((a, b) => this.sb.from("transactions").select("*").eq("user_id", this.userId).eq("ws", this.ws).order("date", { ascending: false }).order("id", { ascending: false }).range(a, b), "transactions");
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

  async deleteTransaction(id: number): Promise<void> {
    const { error } = await this.sb.from("transactions").delete().eq("user_id", this.userId).eq("ws", this.ws).eq("id", id);
    fail(error, "transactions");
  }

  async insertTransactionRaw(t: { type: TransactionType; playerId: string | null; playerName: string; amount: number; costBasis: number | null; date: string; notes: string | null }): Promise<void> {
    const { error } = await this.sb.from("transactions").insert({ user_id: this.userId, ws: this.ws, type: t.type, player_id: t.playerId, player_name: t.playerName, amount: t.amount, cost_basis: t.costBasis, date: t.date, notes: t.notes });
    fail(error, "transactions");
  }

  async saveLineup(formation: Settings["formation"], useCoach: boolean, lineup: Record<string, string | null>): Promise<Record<string, string | null>> {
    const squadIds = new Set((await this.getSquad()).map((s) => s.playerId));
    const players = new Map((await this.getPlayers()).map((p) => [p.id, p]));
    const valid = formationSlots(formation, useCoach).map((s) => s.slot);
    const seen = new Set<string>();
    const clean: Record<string, string | null> = {};
    for (const slot of valid) {
      const pid = lineup[slot] ?? null;
      if (pid && (!squadIds.has(pid) || seen.has(pid))) throw new DomainError("La alineación contiene jugadores repetidos o que no están en tu plantilla.");
      if (pid) {
        const p = players.get(pid);
        if (p && p.position !== slot.split("-")[0]) throw new DomainError(`${p.name} no puede jugar en el hueco ${slot}.`);
        seen.add(pid);
      }
      clean[slot] = pid;
    }
    await this.saveSettings({ formation, useCoach, lineup: clean });
    return clean;
  }

  // ───────────────────────── Mercado diario ─────────────────────────

  async getListings(date?: string): Promise<MarketListing[]> {
    let q = this.sb.from("market_listings").select("*").eq("user_id", this.userId).eq("ws", this.ws);
    if (date) q = q.eq("date", date);
    const { data, error } = await q.order("date", { ascending: false }).order("id");
    fail(error, "listings");
    return ((data as Row[]) ?? []).map((r) => ({ id: Number(r.id), date: String(r.date), playerId: String(r.player_id), askingPrice: num(r.asking_price), seller: (r.seller as string) ?? null }));
  }

  async latestListingDate(): Promise<string | null> {
    const { data, error } = await this.sb.from("market_listings").select("date").eq("user_id", this.userId).eq("ws", this.ws).order("date", { ascending: false }).limit(1);
    fail(error, "listings");
    return (data?.[0]?.date as string) ?? null;
  }

  async addListing(l: { date: string; playerId: string; askingPrice: number | null; seller: string | null }): Promise<void> {
    if (!(await this.getPlayer(l.playerId))) throw new DomainError("Jugador no encontrado", 404);
    const { error } = await this.sb
      .from("market_listings")
      .upsert({ user_id: this.userId, ws: this.ws, date: l.date, player_id: l.playerId, asking_price: l.askingPrice, seller: l.seller }, { onConflict: "user_id,ws,date,player_id" });
    fail(error, "listings");
  }

  async removeListing(id: number): Promise<void> {
    const { error } = await this.sb.from("market_listings").delete().eq("user_id", this.userId).eq("ws", this.ws).eq("id", id);
    fail(error, "listings");
  }

  async clearListings(date: string): Promise<void> {
    const { error } = await this.sb.from("market_listings").delete().eq("user_id", this.userId).eq("ws", this.ws).eq("date", date);
    fail(error, "listings");
  }

  // ───────────────────────── Calendario ─────────────────────────

  async upsertFixtures(fx: Fixture[]): Promise<number> {
    const rows = fx.map((f) => ({ id: f.id, season: f.season, matchday: f.matchday, kickoff: f.kickoff, date: f.date, home_id: f.homeId, away_id: f.awayId, home_score: f.homeScore, away_score: f.awayScore, source: f.source, updated_at: f.updatedAt }));
    let n = 0;
    for (const c of chunks(rows, 400)) n += await this.rpc<number>("fos_upsert_fixtures", { p_ws: this.ws, p_rows: c });
    return n;
  }

  async getFixtures(): Promise<Fixture[]> {
    const rows = await this.all((a, b) => this.sb.from("fixtures").select("*").eq("ws", this.ws).order("matchday").order("date").order("kickoff").range(a, b), "fixtures");
    return rows.map(rowToFixture);
  }

  // ───────────────────────── Alineaciones probables ─────────────────────────

  async getLineups(matchday?: number): Promise<ProbableLineupEntry[]> {
    const rows = await this.all((a, b) => {
      let q = this.sb.from("probable_lineups").select("*").eq("ws", this.ws);
      if (matchday != null) q = q.eq("matchday", matchday);
      return q.order("matchday").order("team_id").order("id").range(a, b);
    }, "lineups");
    return rows.map(rowToLineup);
  }

  async replaceImportedLineup(matchday: number, teamId: string, entries: Omit<ProbableLineupEntry, "id" | "manual" | "matchday" | "teamId">[]): Promise<void> {
    await this.rpc("fos_replace_lineup", { p_ws: this.ws, p_matchday: matchday, p_team: teamId, p_entries: entries });
  }

  async upsertManualLineupEntry(e: { id?: number; matchday: number; teamId: string; playerName: string; playerId: string | null; role: LineupRole; probability: number | null }): Promise<void> {
    const t = this.sb.from("probable_lineups");
    if (e.id) fail((await t.delete().eq("ws", this.ws).eq("id", e.id)).error, "lineups");
    fail((await this.sb.from("probable_lineups").delete().eq("ws", this.ws).eq("matchday", e.matchday).eq("team_id", e.teamId).eq("player_name", e.playerName)).error, "lineups");
    const { error } = await this.sb.from("probable_lineups").insert({
      ws: this.ws, matchday: e.matchday, team_id: e.teamId, player_name: e.playerName, player_id: e.playerId, role: e.role, probability: e.probability, source: "manual", updated_at: nowIso(), manual: true,
    });
    fail(error, "lineups");
  }

  async deleteLineupEntry(id: number): Promise<void> {
    const { error } = await this.sb.from("probable_lineups").delete().eq("ws", this.ws).eq("id", id);
    fail(error, "lineups");
  }

  // ───────────────────────── Evolución ─────────────────────────

  async recordSquadValue(date: string, squadValue: number, budget: number): Promise<void> {
    const { error } = await this.sb.from("squad_value_history").upsert({ user_id: this.userId, ws: this.ws, date, squad_value: squadValue, budget });
    fail(error, "history");
  }

  async getSquadValueHistory(): Promise<SquadValuePoint[]> {
    const rows = await this.all((a, b) => this.sb.from("squad_value_history").select("*").eq("user_id", this.userId).eq("ws", this.ws).order("date").range(a, b), "history");
    return rows.map((r) => ({ date: String(r.date), squadValue: Number(r.squad_value), budget: Number(r.budget) }));
  }

  // ───────────────────────── Registro de sincronizaciones ─────────────────────────

  async startSync(source: string, kind: string): Promise<number> {
    const { data, error } = await this.sb.from("sync_log").insert({ ws: this.ws, source, kind, status: "running" }).select("id").single();
    fail(error, "sync_log");
    return Number((data as Row).id);
  }

  async finishSync(id: number, status: SyncLogEntry["status"], message: string | null, count: number | null): Promise<void> {
    const { error } = await this.sb.from("sync_log").update({ finished_at: nowIso(), status, message, count }).eq("id", id);
    fail(error, "sync_log");
  }

  async getSyncLog(limit = 30): Promise<SyncLogEntry[]> {
    const { data, error } = await this.sb.from("sync_log").select("*").eq("ws", this.ws).order("id", { ascending: false }).limit(limit);
    fail(error, "sync_log");
    return ((data as Row[]) ?? []).map(rowToSync);
  }

  async lastSync(source: string, kind: string, status: SyncLogEntry["status"] = "ok"): Promise<SyncLogEntry | null> {
    const { data, error } = await this.sb.from("sync_log").select("*").eq("ws", this.ws).eq("source", source).eq("kind", kind).eq("status", status).order("id", { ascending: false }).limit(1);
    fail(error, "sync_log");
    return data?.[0] ? rowToSync(data[0] as Row) : null;
  }

  // ───────────────────────── Utilidades de carga ─────────────────────────

  async resetWorkspace(): Promise<void> {
    await this.rpc("fos_reset_ws", { p_user: this.userId, p_ws: this.ws });
  }

  async listUserIds(): Promise<string[]> {
    const data = await this.rpc<string[] | { fos_user_ids: string }[]>("fos_user_ids", { p_ws: this.ws });
    return (data ?? []).map((x) => (typeof x === "string" ? x : x.fos_user_ids));
  }
}
