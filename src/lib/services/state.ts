import type { Store } from "../db/common";
import { today } from "../db/common";
import { calendarState } from "../analytics/fixtures";
import { addDays } from "../domain/time";
import { analyzePlayer, buildContext, type PlayerAnalysis } from "../analytics/analysis";
import { compareLineup, recommendLineup, type LineupComparison, type LineupRecommendation } from "../analytics/lineup";
import { generateRecommendations, pointsGain2, type Recommendation } from "../analytics/recommendations";
import { euroPerPoint, type BidContext } from "../analytics/bidding";
import type { CalendarState, MatchdayInfo, TeamForm } from "../analytics/fixtures";
import { pnl, type PnL } from "../domain/money";
import { formationSlots } from "../domain/formations";
import type { MarketListing, Settings, SquadEntry, SquadValuePoint, SyncLogEntry, Transaction, Workspace } from "../domain/types";

export interface SquadRow {
  entry: SquadEntry;
  analysis: PlayerAnalysis;
  value: number;
  pnl: PnL;
  inLineup: boolean;
}

export interface FullState {
  workspace: Workspace;
  today: string;
  settings: Settings;
  analyses: Map<string, PlayerAnalysis>;
  squad: SquadRow[];
  squadValue: number;
  transactions: Transaction[];
  listings: MarketListing[];
  listingsDate: string | null;
  calendar: CalendarState;
  lineupRec: LineupRecommendation;
  lineupCmp: LineupComparison;
  recommendations: Recommendation[];
  /** Contexto del asesor de pujas (presupuesto, ventas posibles, valor de un punto) */
  bidContext: BidContext;
  /** Puntos extra en 2 jornadas frente a tu titular más flojo de cada línea */
  gain2: Map<string, number>;
  valueHistory: SquadValuePoint[];
  syncLog: SyncLogEntry[];
  dataFreshness: { marketUpdatedAt: string | null; fixturesUpdatedAt: string | null; lineupsUpdatedAt: string | null; snapshotDays: number; playerCount: number };
  balance: { bought: number; sold: number; adjustments: number; realizedProfit: number };
}

export async function buildState(repo: Store, workspace: Workspace, now = new Date()): Promise<FullState> {
  const day = today(now);
  // Histórico necesario para tendencias (30 días) y gráficos (45 días).
  const [settings, players, snaps, fixtures, squadEntries, allListings, transactions, valueHistory, syncLog, snapshotDays, ff, fx, lu] = await Promise.all([
    repo.getSettings(),
    repo.getPlayers(),
    repo.getSnapshots(addDays(day, -60)),
    repo.getFixtures(),
    repo.getSquad(),
    repo.getListings(),
    repo.getTransactions(),
    repo.getSquadValueHistory(),
    repo.getSyncLog(20),
    repo.snapshotDays(),
    repo.lastSync("futbolfantasy", "market"),
    repo.lastSync("calendario", "fixtures"),
    repo.lastSync("futbolfantasy", "lineups"),
  ]);
  const nextMd = calendarState(fixtures, now).next?.matchday;
  const lineups = nextMd != null ? await repo.getLineups(nextMd) : [];
  const ctx = buildContext(fixtures, lineups, day, now);
  const analyses = new Map<string, PlayerAnalysis>();
  for (const p of players) analyses.set(p.id, analyzePlayer(p, snaps.get(p.id), ctx));

  // Alineación guardada coherente con la formación actual
  const slots = formationSlots(settings.formation, settings.useCoach);
  const lineup: Record<string, string | null> = {};
  for (const s of slots) lineup[s.slot] = settings.lineup[s.slot] ?? null;
  settings.lineup = lineup;
  const lineupIds = new Set(Object.values(lineup).filter(Boolean) as string[]);

  const squad: SquadRow[] = [];
  for (const e of squadEntries) {
    const a = analyses.get(e.playerId);
    if (!a) continue;
    const value = a.trend.value ?? e.purchasePrice;
    squad.push({ entry: e, analysis: a, value, pnl: pnl(e.purchasePrice, value), inLineup: lineupIds.has(e.playerId) });
  }
  const squadValue = squad.reduce((s, r) => s + r.value, 0);

  // Evolución real: un punto por día en que se abre la app o se sincroniza.
  if (squad.length > 0 || settings.budget !== 0) {
    await repo.recordSquadValue(day, squadValue, settings.budget);
    const i = valueHistory.findIndex((v) => v.date === day);
    const point = { date: day, squadValue, budget: settings.budget };
    if (i >= 0) valueHistory[i] = point;
    else valueHistory.push(point);
  }

  const squadA = squad.map((r) => r.analysis);
  const lineupRec = recommendLineup(squadA, settings.useCoach);
  const lineupCmp = compareLineup(lineup, analyses, lineupRec, new Set(squadEntries.map((s) => s.playerId)));
  const listingsDate = allListings[0]?.date ?? null;
  const listings = allListings.filter((l) => l.date === listingsDate);
  const remaining = Math.max(1, 38 - (ctx.calendar.next?.matchday ?? 38) + 1);
  const eurPerPoint = euroPerPoint([...analyses.values()].map((a) => ({ value: a.trend.value, pointsAvg: a.player.pointsAvg, pPlay: a.pPlay })), remaining);
  const starters = new Set(lineupRec.slots.map((sl) => sl.playerId).filter(Boolean) as string[]);
  const saleOptions = [...squad]
    .sort((x, y) => Number(starters.has(x.entry.playerId)) - Number(starters.has(y.entry.playerId)) || x.analysis.xp - y.analysis.xp)
    .map((r) => ({ playerId: r.entry.playerId, name: r.analysis.player.name, value: r.value }));
  const bidContext: BidContext = { eurPerPoint, budget: settings.budget, saleOptions };
  const gain2 = new Map<string, number>();
  for (const a of analyses.values()) gain2.set(a.player.id, pointsGain2(a, lineupRec, analyses));
  const recommendations = generateRecommendations({ analyses, squad: squadEntries, settings, listings, lineupRec, lineupCmp, bidContext });

  let bought = 0, sold = 0, adjustments = 0, realizedProfit = 0;
  for (const t of transactions) {
    if (t.type === "compra") bought += t.amount;
    else if (t.type === "venta") {
      sold += t.amount;
      if (t.costBasis != null) realizedProfit += t.amount - t.costBasis;
    } else adjustments += t.playerName.includes("(+)") ? t.amount : -t.amount;
  }

  const marketUpdatedAt = ff?.finishedAt ?? (workspace === "demo" ? players[0]?.updatedAt ?? null : null);

  return {
    workspace,
    today: day,
    settings,
    analyses,
    squad,
    squadValue,
    transactions,
    listings,
    listingsDate,
    calendar: ctx.calendar,
    lineupRec,
    lineupCmp,
    recommendations,
    bidContext,
    gain2,
    valueHistory,
    syncLog,
    dataFreshness: {
      marketUpdatedAt,
      fixturesUpdatedAt: fx?.finishedAt ?? (fixtures[0]?.source === "demo" ? fixtures[0].updatedAt : null),
      lineupsUpdatedAt: [lu?.finishedAt, ...lineups.map((l) => l.updatedAt)].reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null),
      snapshotDays,
      playerCount: players.length,
    },
    balance: { bought, sold, adjustments, realizedProfit },
  };
}

// ───────── Serialización para componentes cliente ─────────

export interface PlayerView {
  id: string;
  name: string;
  shortName: string | null;
  teamId: string | null;
  position: PlayerAnalysis["player"]["position"];
  status: PlayerAnalysis["player"]["status"];
  statusNote: string | null;
  value: number | null;
  prev: number | null;
  change1: number | null;
  pct1: number | null;
  pct3: number | null;
  pct7: number | null;
  accelLabel: PlayerAnalysis["trend"]["accelLabel"];
  direction: PlayerAnalysis["trend"]["direction"];
  streakDays: number | null;
  series: PlayerAnalysis["trend"]["series"];
  trendBasis: PlayerAnalysis["trend"]["basis"];
  pPlay: number;
  pPlaySource: PlayerAnalysis["pPlaySource"];
  startProb: number | null;
  pointsTotal: number | null;
  pointsAvg: number | null;
  points5: number | null;
  played5: number | null;
  lastPoints: number | null;
  xp: number;
  xp2: number;
  gain2: number;
  dailyRate: number | null;
  upcoming: PlayerAnalysis["upcoming"];
  opponentId: string | null;
  home: boolean | null;
  difficulty: number | null;
  opportunity: number;
  valueScore: number;
  pointsScore: number;
  confidence: PlayerAnalysis["confidence"]["level"];
  source: string;
  overridden: string[];
  updatedAt: string;
  lineupRole: PlayerAnalysis["lineupRole"];
}

export function toView(a: PlayerAnalysis, gain2?: number): PlayerView {
  const p = a.player;
  const t = a.trend;
  return {
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    teamId: p.teamId,
    position: p.position,
    status: p.status,
    statusNote: p.statusNote,
    value: t.value,
    prev: t.prev,
    change1: t.change1,
    pct1: t.pct1,
    pct3: t.pct3,
    pct7: t.pct7,
    accelLabel: t.accelLabel,
    direction: t.direction,
    streakDays: t.streakDays,
    series: t.series,
    trendBasis: t.basis,
    pPlay: a.pPlay,
    pPlaySource: a.pPlaySource,
    startProb: p.startProb,
    pointsTotal: p.pointsTotal,
    pointsAvg: p.pointsAvg,
    points5: p.points5,
    played5: p.played5,
    lastPoints: p.lastPoints,
    xp: Math.round(a.xp * 10) / 10,
    xp2: Math.round(a.xp2 * 10) / 10,
    gain2: Math.round((gain2 ?? 0) * 10) / 10,
    dailyRate: t.dailyRate,
    upcoming: a.upcoming,
    opponentId: a.opponentId,
    home: a.home,
    difficulty: a.difficulty,
    opportunity: a.opportunity,
    valueScore: Math.round(a.valueScore),
    pointsScore: Math.round(a.pointsScore),
    confidence: a.confidence.level,
    source: p.source,
    overridden: p.overridden,
    updatedAt: p.updatedAt,
    lineupRole: a.lineupRole,
  };
}

export interface MatchdayView {
  matchday: number;
  firstKickoff: string | null;
  firstDate: string | null;
  allTimesKnown: boolean;
  fixtures: { id: string; homeId: string; awayId: string; kickoff: string | null; date: string; homeScore: number | null; awayScore: number | null; source: string }[];
}

export function toMatchdayView(m: MatchdayInfo | null): MatchdayView | null {
  if (!m) return null;
  return {
    matchday: m.matchday,
    firstKickoff: m.firstKickoff,
    firstDate: m.firstDate,
    allTimesKnown: m.allTimesKnown,
    fixtures: m.fixtures.map((f) => ({ id: f.id, homeId: f.homeId, awayId: f.awayId, kickoff: f.kickoff, date: f.date, homeScore: f.homeScore, awayScore: f.awayScore, source: f.source })),
  };
}

export function tableView(t: Map<string, TeamForm>): TeamForm[] {
  return [...t.values()].sort((a, b) => a.rank - b.rank);
}
