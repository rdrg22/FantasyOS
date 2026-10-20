import type { Fixture, Player, PriceSnapshot, ProbableLineupEntry } from "../domain/types";
import { computeTrend, momentumScore, type Trend } from "./trends";
import { calendarState, fixtureFactor, opponentDifficulty, opponentIn, type CalendarState } from "./fixtures";

export interface UpcomingMatch {
  matchday: number;
  opponentId: string | null;
  home: boolean | null;
  difficulty: number | null;
  factor: number;
}

export type ConfidenceLevel = "baja" | "media" | "alta";

export interface PlayerAnalysis {
  player: Player;
  trend: Trend;
  momentum: number;
  /** Probabilidad de jugar (0..1) y de dónde sale */
  pPlay: number;
  pPlaySource: "alineacion-probable" | "fuente" | "historial" | "estado" | "supuesto";
  /** Puntos base por partido jugado */
  basePoints: number;
  basePointsSource: "temporada+reciente" | "temporada" | "reciente" | "supuesto";
  xp: number;
  /** Puntos esperados sumando las dos próximas jornadas */
  xp2: number;
  /** Rivales de las dos próximas jornadas */
  upcoming: UpcomingMatch[];
  opponentId: string | null;
  home: boolean | null;
  kickoff: string | null;
  difficulty: number | null;
  factor: number;
  noMatch: boolean;
  /** 0..100 */
  valueScore: number;
  pointsScore: number;
  opportunity: number;
  confidence: { level: ConfidenceLevel; score: number; used: string[]; missing: string[] };
  lineupRole: ProbableLineupEntry["role"] | null;
}

// Media aproximada de puntos por partido jugado en LaLiga Fantasy cuando no hay datos del jugador.
// Se usa solo como último recurso y se marca con confianza baja.
const FALLBACK_POINTS: Record<Player["position"], number> = { POR: 3, DEF: 3, MED: 3, DEL: 3.5, ENT: 3 };

export interface AnalysisContext {
  today: string;
  now: Date;
  calendar: CalendarState;
  lineupsByPlayer: Map<string, ProbableLineupEntry>;
}

export function buildContext(fixtures: Fixture[], lineups: ProbableLineupEntry[], today: string, now = new Date()): AnalysisContext {
  const calendar = calendarState(fixtures, now);
  const md = calendar.next?.matchday;
  const lineupsByPlayer = new Map<string, ProbableLineupEntry>();
  for (const l of lineups) {
    if (!l.playerId || (md != null && l.matchday !== md)) continue;
    const prev = lineupsByPlayer.get(l.playerId);
    if (!prev || (l.manual && !prev.manual)) lineupsByPlayer.set(l.playerId, l);
  }
  return { today, now, calendar, lineupsByPlayer };
}

export function analyzePlayer(player: Player, snaps: PriceSnapshot[] | undefined, ctx: AnalysisContext): PlayerAnalysis {
  const trend = computeTrend(player, snaps, ctx.today);
  const momentum = momentumScore(trend);
  const used: string[] = [];
  const missing: string[] = [];

  if (trend.basis === "sin-datos") missing.push("histórico de precios");
  else used.push(trend.basis === "instantaneas" ? `precios propios (${trend.daysOfData} días)` : "histórico de precios de la fuente");

  // ── Probabilidad de jugar ──
  const lu = ctx.lineupsByPlayer.get(player.id) ?? null;
  let pPlay: number;
  let pPlaySource: PlayerAnalysis["pPlaySource"];
  if (player.status === "lesionado" || player.status === "sancionado") {
    pPlay = 0;
    pPlaySource = "estado";
    used.push(`estado: ${player.status}`);
  } else if (lu) {
    pPlay = lu.probability ?? (lu.role === "titular" ? 0.8 : lu.role === "duda" ? 0.4 : lu.role === "suplente" ? 0.15 : 0);
    pPlaySource = "alineacion-probable";
    used.push("alineación probable");
  } else if (player.startProb != null) {
    pPlay = player.startProb;
    pPlaySource = "fuente";
    used.push("probabilidad de titularidad");
  } else if (player.played5 != null) {
    pPlay = Math.min(1, player.played5 / 5) * 0.85;
    pPlaySource = "historial";
    used.push("partidos jugados recientes");
  } else {
    pPlay = 0.5;
    pPlaySource = "supuesto";
    missing.push("probabilidad de jugar");
  }
  if (player.status === "duda") pPlay = Math.min(pPlay, 0.5);

  // ── Puntos base ──
  let basePoints: number;
  let basePointsSource: PlayerAnalysis["basePointsSource"];
  const recent = player.points5 != null && player.played5 ? player.points5 / player.played5 : null;
  if (player.pointsAvg != null && recent != null) {
    basePoints = 0.6 * recent + 0.4 * player.pointsAvg;
    basePointsSource = "temporada+reciente";
  } else if (player.pointsAvg != null) {
    basePoints = player.pointsAvg;
    basePointsSource = "temporada";
  } else if (recent != null) {
    basePoints = recent;
    basePointsSource = "reciente";
  } else {
    basePoints = FALLBACK_POINTS[player.position];
    basePointsSource = "supuesto";
  }
  if (basePointsSource === "supuesto") missing.push("puntos Fantasy");
  else used.push("puntos Fantasy");

  // ── Rival ──
  const md = ctx.calendar.next;
  const fromCal = opponentIn(player.teamId, md);
  let opponentId = fromCal?.opponentId ?? null;
  let home = fromCal?.home ?? null;
  if (!fromCal && player.nextOpponentId && (md == null || player.nextMatchday == null || player.nextMatchday === md.matchday)) {
    opponentId = player.nextOpponentId;
    home = player.nextHome;
  }
  const noMatch = Boolean(md && player.teamId && !fromCal && md.fixtures.length >= 10);
  const difficulty = opponentDifficulty(opponentId, ctx.calendar.table);
  const factor = fixtureFactor(opponentId, home, ctx.calendar.table, ctx.calendar.leagueAvgPpg);
  if (opponentId) used.push("rival y localía");
  else missing.push("próximo rival");
  if (noMatch) pPlay = 0;

  const xp = Math.max(0, basePoints * pPlay * factor);

  // ── Dos próximas jornadas ──
  const upcoming: UpcomingMatch[] = [];
  if (md) upcoming.push({ matchday: md.matchday, opponentId, home, difficulty, factor });
  const md2 = ctx.calendar.following;
  let xp2 = xp;
  if (md2) {
    const f2 = opponentIn(player.teamId, md2);
    const opp2 = f2?.opponentId ?? null;
    const factor2 = fixtureFactor(opp2, f2?.home ?? null, ctx.calendar.table, ctx.calendar.leagueAvgPpg);
    upcoming.push({ matchday: md2.matchday, opponentId: opp2, home: f2?.home ?? null, difficulty: opponentDifficulty(opp2, ctx.calendar.table), factor: factor2 });
    // Para la segunda jornada no hay alineación probable: se usa la probabilidad base (sin el "sin partido" de esta jornada).
    const p2 = player.status === "lesionado" || player.status === "sancionado" ? 0 : noMatch ? Math.min(1, player.startProb ?? 0.5) : pPlay;
    xp2 = xp + (f2 ? Math.max(0, basePoints * p2 * factor2) : 0);
  }

  // ── Puntuaciones ──
  const playBoost = pPlay >= 0.7 ? 10 : pPlay < 0.3 ? -15 : 0;
  const valueScore = clamp(50 + momentum * 0.45 + playBoost, 0, 100);
  // ~8 xP es élite en LaLiga Fantasy; escala lineal.
  const pointsScore = clamp((xp / 8) * 100, 0, 100);
  const opportunity = Math.round(clamp(0.55 * Math.max(valueScore, pointsScore) + 0.45 * ((valueScore + pointsScore) / 2), 0, 100));

  const score = used.length / (used.length + missing.length || 1);
  const level: ConfidenceLevel = score >= 0.75 && trend.basis !== "sin-datos" ? "alta" : score >= 0.5 ? "media" : "baja";

  return {
    player,
    trend,
    momentum,
    pPlay,
    pPlaySource,
    basePoints,
    basePointsSource,
    xp,
    xp2,
    upcoming,
    opponentId,
    home,
    kickoff: fromCal?.fixture.kickoff ?? null,
    difficulty,
    factor,
    noMatch,
    valueScore,
    pointsScore,
    opportunity,
    confidence: { level, score, used, missing },
    lineupRole: lu?.role ?? null,
  };
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
