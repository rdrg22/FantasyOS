import type { Repo, PlayerInput } from "../db/repo";
import { today } from "../db/repo";
import { fetchText, ProviderError, sleep } from "../providers/http";
import { FF_MARKET_URL, FF_POINTS_URL, parseFfMarket, parseFfPoints } from "../providers/futbolfantasy/market";
import { FF_LINEUPS_HUB, parseHubLinks, parseMatchPage, type FfLineupPlayer } from "../providers/futbolfantasy/lineups";
import { fetchOpenfootball } from "../providers/openfootball";
import { fetchFootballData, footballDataEnabled } from "../providers/footballdata";
import { calendarState } from "../analytics/fixtures";
import { getTeam } from "../domain/teams";
import { normalizeName } from "../domain/normalize";
import type { Player, PlayerStatus } from "../domain/types";
import { madridToIso } from "../domain/time";

export type SyncKind = "market" | "fixtures" | "lineups";
export interface SyncResult {
  kind: SyncKind;
  status: "ok" | "error" | "skipped";
  message: string;
  count: number;
}

const SOURCE: Record<SyncKind, string> = { market: "futbolfantasy", fixtures: "calendario", lineups: "futbolfantasy" };

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

async function run(repo: Repo, kind: SyncKind, force: boolean, fn: () => Promise<{ count: number; message: string }>): Promise<SyncResult> {
  const source = SOURCE[kind];
  const last = repo.lastSync(source, kind);
  if (!force && last?.finishedAt && Date.now() - Date.parse(last.finishedAt) < minIntervalMs()) {
    return { kind, status: "skipped", message: `Datos actualizados hace menos de ${Math.round(minIntervalMs() / 60000)} min; no se repite la petición.`, count: 0 };
  }
  const id = repo.startSync(source, kind);
  try {
    const r = await fn();
    repo.finishSync(id, "ok", r.message, r.count);
    return { kind, status: "ok", ...r };
  } catch (e) {
    const msg = e instanceof ProviderError || e instanceof Error ? e.message : String(e);
    repo.finishSync(id, "error", msg, null);
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

// ───────────────────────── Mercado + puntos (FútbolFantasy) ─────────────────────────

export async function syncMarket(repo: Repo, force = false): Promise<SyncResult> {
  if (!ffEnabled()) return { kind: "market", status: "skipped", message: "Integración con FútbolFantasy desactivada (FOS_ENABLE_FUTBOLFANTASY=false).", count: 0 };
  return run(repo, "market", force, async () => {
    const html = await fetchText(FF_MARKET_URL);
    const market = parseFfMarket(html);
    const now = new Date().toISOString();
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
      updatedAt: market.sourceUpdatedAt ? madridToIso(market.sourceUpdatedAt.slice(0, 10), market.sourceUpdatedAt.slice(11, 16)) : now,
    }));
    repo.upsertPlayers(inputs);
    repo.recordSnapshots(inputs.map((p) => ({ playerId: p.id, value: p.value! })), today(), "futbolfantasy");

    // Jugadores creados a mano que ahora existen en la fuente: se fusionan.
    const catalog = repo.getPlayers();
    const ffPlayers = catalog.filter((p) => p.source === "futbolfantasy");
    let merged = 0;
    for (const p of catalog.filter((x) => x.source === "manual" || x.source === "csv")) {
      const target = matchPlayer(ffPlayers, p.teamId, p.normName);
      if (target) { repo.relinkPlayer(p.id, target.id); merged++; }
    }

    // Puntos (segunda petición, espaciada)
    let pointsMsg = "";
    try {
      await sleep(1500);
      const pts = parseFfPoints(await fetchText(FF_POINTS_URL));
      const byFf = new Map(ffPlayers.map((p) => [p.sourceId, p]));
      const rows = [];
      for (const r of pts.rows) {
        const p = byFf.get(r.ffId) ?? matchPlayer(ffPlayers, r.teamId, r.normName);
        if (!p) continue;
        rows.push({ id: p.id, pointsTotal: r.pointsTotal, pointsAvg: r.pointsAvg, points5: r.points5, played5: r.played5, matchesPlayed: r.matchesPlayed, lastPoints: r.lastPoints });
      }
      const n = repo.updatePoints(rows);
      pointsMsg = ` · puntos de ${n} jugadores`;
    } catch (e) {
      pointsMsg = ` · puntos no disponibles (${e instanceof Error ? e.message : e})`;
    }
    return {
      count: inputs.length,
      message: `${inputs.length} jugadores (${market.skipped} filas descartadas)${merged ? `, ${merged} jugadores manuales vinculados` : ""}${pointsMsg}. Fuente actualizada: ${market.sourceUpdatedAt?.replace("T", " ") ?? "desconocido"}`,
    };
  });
}

// ───────────────────────── Calendario ─────────────────────────

export async function syncFixtures(repo: Repo, force = false): Promise<SyncResult> {
  return run(repo, "fixtures", force, async () => {
    const season = currentSeason();
    if (footballDataEnabled()) {
      try {
        const r = await fetchFootballData(season);
        if (r.fixtures.length > 0) {
          repo.upsertFixtures(r.fixtures);
          return { count: r.fixtures.length, message: `${r.fixtures.length} partidos desde football-data.org (${season}).` };
        }
      } catch (e) {
        // si falla, se intenta openfootball
        const r = await fetchOpenfootball(season);
        repo.upsertFixtures(r.fixtures);
        return { count: r.fixtures.length, message: `football-data.org falló (${e instanceof Error ? e.message : e}); ${r.fixtures.length} partidos desde openfootball.` };
      }
    }
    const r = await fetchOpenfootball(season);
    if (r.fixtures.length === 0) throw new ProviderError(`openfootball no tiene partidos para ${season}.`, "parse");
    repo.upsertFixtures(r.fixtures);
    const played = r.fixtures.filter((f) => f.homeScore != null).length;
    return {
      count: r.fixtures.length,
      message: `${r.fixtures.length} partidos (${played} con resultado) desde openfootball ${season}${r.unknownTeams.length ? `. Equipos sin reconocer: ${r.unknownTeams.join(", ")}` : ""}.`,
    };
  });
}

// ───────────────────────── Alineaciones probables ─────────────────────────

function roleToStatus(p: FfLineupPlayer): PlayerStatus {
  if (p.role === "lesionado") return "lesionado";
  if (p.role === "sancionado") return "sancionado";
  if (p.role === "duda") return "duda";
  return "disponible";
}

export async function syncLineups(repo: Repo, force = false): Promise<SyncResult> {
  if (!ffEnabled()) return { kind: "lineups", status: "skipped", message: "Integración con FútbolFantasy desactivada.", count: 0 };
  return run(repo, "lineups", force, async () => {
    const cal = calendarState(repo.getFixtures());
    const md = cal.next;
    if (!md) throw new ProviderError("No hay próxima jornada en el calendario. Sincroniza primero el calendario.", "parse");
    const links = parseHubLinks(await fetchText(FF_LINEUPS_HUB));
    const catalog = repo.getPlayers();
    const now = new Date().toISOString();
    let teams = 0;
    let players = 0;
    const errors: string[] = [];
    for (const f of md.fixtures) {
      const url = links.get(`${f.homeId}-${f.awayId}`);
      const label = `${getTeam(f.homeId)?.name}–${getTeam(f.awayId)?.name}`;
      if (!url) { errors.push(`${label}: sin página`); continue; }
      await sleep(1500);
      try {
        const html = await fetchText(url);
        const res = parseMatchPage(html, getTeam(f.homeId)!.name, getTeam(f.awayId)!.name);
        for (const [teamId, list] of [[f.homeId, res.home], [f.awayId, res.away]] as const) {
          const availability: { id: string; status: PlayerStatus; startProb: number | null; note: string | null }[] = [];
          const entries = list.map((p) => {
            const match = matchPlayer(catalog, teamId, p.normName, p.displayName);
            if (match) availability.push({ id: match.id, status: roleToStatus(p), startProb: p.probability, note: p.note });
            return { playerName: match?.name ?? p.displayName, playerId: match?.id ?? null, role: p.role, probability: p.probability, source: "futbolfantasy" as const, updatedAt: now };
          });
          repo.replaceImportedLineup(md.matchday, teamId, entries);
          repo.updateAvailability(availability);
          teams++;
          players += entries.length;
        }
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (teams === 0) throw new ProviderError(`No se pudo importar ninguna alineación de la jornada ${md.matchday}. ${errors.join(" · ")}`, "parse");
    return { count: players, message: `Jornada ${md.matchday}: ${teams} equipos, ${players} jugadores${errors.length ? `. Incidencias: ${errors.join(" · ")}` : ""}.` };
  });
}

export async function syncAll(repo: Repo, force = false): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  out.push(await syncFixtures(repo, force));
  out.push(await syncMarket(repo, force));
  out.push(await syncLineups(repo, force));
  return out;
}
