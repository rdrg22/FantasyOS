import type { PlayerInput, Store } from "../db/common";
import { today } from "../db/common";
import { fetchText, ProviderError, sleep } from "../providers/http";
import { FF_MARKET_URL, FF_POINTS_URL, parseFfMarket, parseFfPoints } from "../providers/futbolfantasy/market";
import { FF_LINEUPS_HUB, parseHubLinks, parseHubResults, parseMatchPage, type FfLineupPlayer } from "../providers/futbolfantasy/lineups";
import { fetchOpenfootball } from "../providers/openfootball";
import { fetchFootballData, footballDataEnabled } from "../providers/footballdata";
import { calendarState } from "../analytics/fixtures";
import { attributableMatchdayPoints } from "../analytics/ideal";
import { getTeam } from "../domain/teams";
import { normalizeName } from "../domain/normalize";
import type { Player, PlayerStatus } from "../domain/types";
import { madridToIso } from "../domain/time";

/**
 * Sincronización por pasos cortos. Cada paso cabe en el límite de tiempo de una
 * función serverless (~10 s); las alineaciones se procesan por tandas de partidos.
 */
export type SyncKind = "fixtures" | "results" | "market" | "points" | "lineups";
export const SYNC_STEPS: SyncKind[] = ["fixtures", "results", "market", "points", "lineups"];

export interface SyncResult {
  kind: SyncKind;
  status: "ok" | "error" | "skipped";
  message: string;
  count: number;
  /** Solo alineaciones: partidos pendientes y los que fallaron en esta tanda */
  remaining?: number;
  failed?: string[];
}

const SOURCE: Record<SyncKind, string> = { market: "futbolfantasy", points: "futbolfantasy", fixtures: "calendario", results: "futbolfantasy", lineups: "futbolfantasy" };

export function ffEnabled() {
  return (process.env.FOS_ENABLE_FUTBOLFANTASY ?? "true").toLowerCase() !== "false";
}

function minIntervalMs() {
  const n = Number(process.env.FOS_MIN_SYNC_INTERVAL_MIN ?? 60);
  return (Number.isFinite(n) && n >= 5 ? n : 60) * 60_000;
}

export function currentSeason(d = new Date()): string {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function run(repo: Store, kind: SyncKind, force: boolean, fn: () => Promise<{ count: number; message: string }>): Promise<SyncResult> {
  const source = SOURCE[kind];
  const last = await repo.lastSync(source, kind);
  if (!force && last?.finishedAt && Date.now() - Date.parse(last.finishedAt) < minIntervalMs()) {
    return { kind, status: "skipped", message: `Actualizado hace menos de ${Math.round(minIntervalMs() / 60000)} min; no se repite la petición.`, count: 0 };
  }
  const id = await repo.startSync(source, kind);
  try {
    const r = await fn();
    await repo.finishSync(id, "ok", r.message, r.count);
    return { kind, status: "ok", ...r };
  } catch (e) {
    const msg = e instanceof ProviderError || e instanceof Error ? e.message : String(e);
    await repo.finishSync(id, "error", msg, null);
    return { kind, status: "error", message: msg, count: 0 };
  }
}

/** Busca el jugador del catálogo que corresponde a un nombre de otra fuente. */
export function matchPlayer(catalog: Player[], teamId: string | null, normName: string, shortName?: string | null): Player | null {
  const sameTeam = catalog.filter((p) => !teamId || p.teamId === teamId);
  const exact = sameTeam.find((p) => p.normName === normName);
  if (exact) return exact;
  const tokens = normName.split(" ").filter((t) => t.length > 2);
  const short = shortName ? normalizeName(shortName) : null;
  if (short) {
    const s = sameTeam.filter((p) => p.shortName && normalizeName(p.shortName) === short);
    if (s.length === 1) return s[0];
  }
  const contained = sameTeam.filter((p) => tokens.length > 0 && tokens.every((t) => p.normName.split(" ").includes(t)));
  if (contained.length === 1) return contained[0];
  const reverse = sameTeam.filter((p) => {
    const pt = p.normName.split(" ").filter((t) => t.length > 2);
    return pt.length > 0 && pt.every((t) => tokens.includes(t));
  });
  return reverse.length === 1 ? reverse[0] : null;
}

// ───────────────────────── Mercado (FútbolFantasy) ─────────────────────────

export async function syncMarket(repo: Store, force = false): Promise<SyncResult> {
  if (!ffEnabled()) return { kind: "market", status: "skipped", message: "Integración con FútbolFantasy desactivada (FOS_ENABLE_FUTBOLFANTASY=false).", count: 0 };
  return run(repo, "market", force, async () => {
    const html = await fetchText(FF_MARKET_URL);
    const market = parseFfMarket(html);
    const now = new Date().toISOString();
    const updatedAt = market.sourceUpdatedAt ? madridToIso(market.sourceUpdatedAt.slice(0, 10), market.sourceUpdatedAt.slice(11, 16)) : now;
    const inputs: PlayerInput[] = market.players.map((m) => ({
      id: `ff:${m.ffId}`,
      name: m.name,
      shortName: m.shortName,
      normName: m.normName,
      teamId: m.teamId,
      position: m.position,
      status: "desconocido",
      statusNote: null,
      startProb: m.startProb,
      value: m.value,
      sourceHistory: m.history,
      sourceStreakDays: m.streakDays,
      sourceAcceleration: m.acceleration,
      nextOpponentId: m.nextOpponentId,
      nextHome: m.nextHome,
      nextMatchday: m.nextMatchday,
      pointsTotal: null,
      pointsAvg: null,
      points5: null,
      played5: null,
      matchesPlayed: null,
      lastPoints: null,
      source: "futbolfantasy",
      sourceId: m.ffId,
      updatedAt,
    }));
    await repo.upsertPlayers(inputs);
    await repo.recordSnapshots(inputs.map((p) => ({ playerId: p.id, value: p.value! })), today(), "futbolfantasy");

    // Jugadores creados a mano que ahora existen en la fuente: se fusionan.
    const catalog = await repo.getPlayers();
    const ffPlayers = catalog.filter((p) => p.source === "futbolfantasy");
    let merged = 0;
    for (const p of catalog.filter((x) => x.source === "manual" || x.source === "csv")) {
      const target = matchPlayer(ffPlayers, p.teamId, p.normName);
      if (target) {
        await repo.relinkPlayer(p.id, target.id);
        merged++;
      }
    }
    return {
      count: inputs.length,
      message: `${inputs.length} jugadores (${market.skipped} filas descartadas)${merged ? `, ${merged} jugadores manuales vinculados` : ""}. Fuente actualizada: ${market.sourceUpdatedAt?.replace("T", " ") ?? "desconocido"}`,
    };
  });
}

// ───────────────────────── Puntos (FútbolFantasy) ─────────────────────────

export async function syncPoints(repo: Store, force = false): Promise<SyncResult> {
  if (!ffEnabled()) return { kind: "points", status: "skipped", message: "Integración con FútbolFantasy desactivada.", count: 0 };
  return run(repo, "points", force, async () => {
    const pts = parseFfPoints(await fetchText(FF_POINTS_URL));
    const ffPlayers = (await repo.getPlayers()).filter((p) => p.source === "futbolfantasy");
    if (ffPlayers.length === 0) throw new ProviderError("Sincroniza primero el mercado: no hay jugadores a los que asignar puntos.", "parse");
    const byFf = new Map(ffPlayers.map((p) => [p.sourceId, p]));
    const rows = [];
    for (const r of pts.rows) {
      const p = byFf.get(r.ffId) ?? matchPlayer(ffPlayers, r.teamId, r.normName);
      if (!p) continue;
      rows.push({ id: p.id, teamId: p.teamId, pointsTotal: r.pointsTotal, pointsAvg: r.pointsAvg, points5: r.points5, played5: r.played5, matchesPlayed: r.matchesPlayed, lastPoints: r.lastPoints });
    }
    const n = await repo.updatePoints(rows);
    // Puntos de la jornada (once ideal): solo de los equipos que ya la han jugado.
    const md = attributableMatchdayPoints(rows, await repo.getFixtures());
    if (md && md.rows.length) await repo.saveMatchdayPoints(md.matchday, md.rows);
    return {
      count: n,
      message: `Puntos de ${n} jugadores (${pts.rows.length} filas en la fuente).${md?.rows.length ? ` Jornada ${md.matchday}: ${md.rows.length} jugadores${md.complete ? "" : " (en curso)"}.` : ""}`,
    };
  });
}

// ───────────────────────── Calendario ─────────────────────────

export async function syncFixtures(repo: Store, force = false): Promise<SyncResult> {
  return run(repo, "fixtures", force, async () => {
    const season = currentSeason();
    if (footballDataEnabled()) {
      try {
        const r = await fetchFootballData(season);
        if (r.fixtures.length > 0) {
          await repo.upsertFixtures(r.fixtures);
          return { count: r.fixtures.length, message: `${r.fixtures.length} partidos desde football-data.org (${season}).` };
        }
      } catch (e) {
        const r = await fetchOpenfootball(season);
        await repo.upsertFixtures(r.fixtures);
        return { count: r.fixtures.length, message: `football-data.org falló (${e instanceof Error ? e.message : e}); ${r.fixtures.length} partidos desde openfootball.` };
      }
    }
    const r = await fetchOpenfootball(season);
    if (r.fixtures.length === 0) throw new ProviderError(`openfootball no tiene partidos para ${season}.`, "parse");
    await repo.upsertFixtures(r.fixtures);
    const played = r.fixtures.filter((f) => f.homeScore != null).length;
    return {
      count: r.fixtures.length,
      message: `${r.fixtures.length} partidos (${played} con resultado) desde openfootball ${season}${r.unknownTeams.length ? `. Equipos sin reconocer: ${r.unknownTeams.join(", ")}` : ""}.`,
    };
  });
}

// ───────────────────────── Alineaciones probables (por tandas) ─────────────────────────

function roleToStatus(p: FfLineupPlayer): PlayerStatus {
  if (p.role === "lesionado") return "lesionado";
  if (p.role === "sancionado") return "sancionado";
  if (p.role === "duda") return "duda";
  return "disponible";
}

/**
 * Importa alineaciones de la próxima jornada partido a partido hasta agotar `budgetMs`.
 * Un partido se considera al día si sus dos equipos se importaron dentro del intervalo mínimo.
 * `exclude`: partidos que ya fallaron en esta ronda (no se reintentan).
 */
export async function syncLineups(repo: Store, opts: { force?: boolean; budgetMs?: number; exclude?: string[] } = {}): Promise<SyncResult> {
  const { force = false, budgetMs = 7000, exclude = [] } = opts;
  if (!ffEnabled()) return { kind: "lineups", status: "skipped", message: "Integración con FútbolFantasy desactivada.", count: 0, remaining: 0 };
  const started = Date.now();
  const md = calendarState(await repo.getFixtures()).next;
  if (!md) return { kind: "lineups", status: "error", message: "No hay próxima jornada en el calendario. Sincroniza primero el calendario.", count: 0, remaining: 0 };

  const existing = await repo.getLineups(md.matchday);
  const freshTeams = new Set(existing.filter((e) => !e.manual && Date.now() - Date.parse(e.updatedAt) < minIntervalMs()).map((e) => e.teamId));
  const key = (f: { homeId: string; awayId: string }) => `${f.homeId}-${f.awayId}`;
  const pending = md.fixtures.filter((f) => (force || !(freshTeams.has(f.homeId) && freshTeams.has(f.awayId))) && !exclude.includes(key(f)));
  if (pending.length === 0) {
    return { kind: "lineups", status: "skipped", message: `Jornada ${md.matchday}: alineaciones ya actualizadas.`, count: 0, remaining: 0, failed: [] };
  }

  const id = await repo.startSync("futbolfantasy", "lineups");
  try {
    const links = parseHubLinks(await fetchText(FF_LINEUPS_HUB));
    const catalog = await repo.getPlayers();
    const now = new Date().toISOString();
    let done = 0;
    let players = 0;
    const failed: string[] = [];
    const errors: string[] = [];
    for (const f of pending) {
      if (done + failed.length > 0 && Date.now() - started > budgetMs) break;
      const label = `${getTeam(f.homeId)?.name}–${getTeam(f.awayId)?.name}`;
      const url = links.get(key(f));
      if (!url) {
        failed.push(key(f));
        errors.push(`${label}: sin página`);
        continue;
      }
      if (done + failed.length > 0) await sleep(1000);
      try {
        const html = await fetchText(url, { timeoutMs: 8000, retries: 0 });
        const res = parseMatchPage(html, getTeam(f.homeId)!.name, getTeam(f.awayId)!.name);
        for (const [teamId, list] of [[f.homeId, res.home], [f.awayId, res.away]] as const) {
          const availability: { id: string; status: PlayerStatus; startProb: number | null; note: string | null }[] = [];
          const discipline: { id: string; yellow: number | null; red: number | null; warned: boolean }[] = [];
          const entries = list.map((p) => {
            const match = matchPlayer(catalog, teamId, p.normName, p.displayName);
            if (match) availability.push({ id: match.id, status: roleToStatus(p), startProb: p.probability, note: p.note });
            if (match && (p.yellow != null || p.red != null || p.warned)) discipline.push({ id: match.id, yellow: p.yellow, red: p.red, warned: p.warned });
            return { playerName: match?.name ?? p.displayName, playerId: match?.id ?? null, role: p.role, probability: p.probability, source: "futbolfantasy" as const, updatedAt: now };
          });
          await repo.replaceImportedLineup(md.matchday, teamId, entries);
          await repo.updateAvailability(availability);
          await repo.updateDiscipline(discipline);
          players += entries.length;
        }
        done++;
      } catch (e) {
        failed.push(key(f));
        errors.push(`${label}: ${e instanceof Error ? e.message : e}`);
      }
    }
    const remaining = pending.length - done - failed.length;
    const message = `Jornada ${md.matchday}: ${done} partidos importados (${players} jugadores)${remaining ? `, ${remaining} pendientes` : ""}${errors.length ? `. Incidencias: ${errors.join(" · ")}` : ""}.`;
    await repo.finishSync(id, done > 0 || remaining > 0 ? "ok" : "error", message, players);
    return { kind: "lineups", status: done > 0 || remaining > 0 ? "ok" : "error", message, count: players, remaining, failed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await repo.finishSync(id, "error", msg, null);
    return { kind: "lineups", status: "error", message: msg, count: 0, remaining: 0, failed: [] };
  }
}

// ───────────────────────── Resultados (FútbolFantasy) ─────────────────────────

/** Marcadores recientes desde la página central de FútbolFantasy (más al día que el calendario abierto). */
export async function syncResults(repo: Store, force = false): Promise<SyncResult> {
  if (!ffEnabled()) return { kind: "results", status: "skipped", message: "Integración con FútbolFantasy desactivada.", count: 0 };
  return run(repo, "results", force, async () => {
    const results = parseHubResults(await fetchText(FF_LINEUPS_HUB), (id) => Boolean(getTeam(id)));
    const season = currentSeason();
    const todayStr = today();
    const fixtures = (await repo.getFixtures()).filter((f) => f.season === season && f.date <= todayStr);
    const changed = [];
    for (const r of results) {
      const f = fixtures.find((x) => x.homeId === r.homeId && x.awayId === r.awayId);
      if (!f || (f.homeScore === r.homeScore && f.awayScore === r.awayScore)) continue;
      changed.push({ ...f, homeScore: r.homeScore, awayScore: r.awayScore, source: "futbolfantasy" as const, updatedAt: new Date().toISOString() });
    }
    if (changed.length) await repo.upsertFixtures(changed);
    return { count: changed.length, message: `${results.length} marcadores leídos, ${changed.length} resultados nuevos o corregidos.` };
  });
}

/** Ejecuta todos los pasos (para CLI o procesos sin límite de tiempo). */
export async function syncAll(repo: Store, force = false): Promise<SyncResult[]> {
  const out: SyncResult[] = [await syncFixtures(repo, force), await syncResults(repo, force), await syncMarket(repo, force), await syncPoints(repo, force)];
  out.push(...(await syncLineupsAll(repo, force)));
  return out;
}

/** Todas las tandas de alineaciones seguidas (sin límite de tiempo: CLI o local). */
export async function syncLineupsAll(repo: Store, force = false): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  const exclude: string[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await syncLineups(repo, { force: force && i === 0, budgetMs: 60_000, exclude });
    out.push(r);
    exclude.push(...(r.failed ?? []));
    if (!r.remaining) break;
  }
  return out;
}

export async function syncStep(repo: Store, kind: SyncKind, opts: { force?: boolean; exclude?: string[] } = {}): Promise<SyncResult> {
  switch (kind) {
    case "fixtures": return syncFixtures(repo, opts.force);
    case "results": return syncResults(repo, opts.force);
    case "market": return syncMarket(repo, opts.force);
    case "points": return syncPoints(repo, opts.force);
    case "lineups": return syncLineups(repo, { force: opts.force, exclude: opts.exclude });
  }
}
