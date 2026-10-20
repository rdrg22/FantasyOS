// Modelo de dominio de Fantasy OS. Independiente de cualquier proveedor externo.

export type Position = "POR" | "DEF" | "MED" | "DEL" | "ENT";
export const POSITIONS: Position[] = ["POR", "DEF", "MED", "DEL", "ENT"];
export const POSITION_LABEL: Record<Position, string> = {
  POR: "Portero",
  DEF: "Defensa",
  MED: "Centrocampista",
  DEL: "Delantero",
  ENT: "Entrenador",
};

export type PlayerStatus = "disponible" | "duda" | "lesionado" | "sancionado" | "desconocido";
export const STATUS_LABEL: Record<PlayerStatus, string> = {
  disponible: "Disponible",
  duda: "Duda",
  lesionado: "Lesionado",
  sancionado: "Sancionado",
  desconocido: "Sin datos",
};

export type DataSource = "futbolfantasy" | "openfootball" | "football-data" | "manual" | "csv" | "demo";

/** Valores de mercado N mercados atrás, tal como los publica la fuente (no inventados). */
export interface SourceHistory {
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d7: number | null;
  d14: number | null;
  d30: number | null;
}

export interface Player {
  id: string;
  name: string;
  shortName: string | null;
  normName: string;
  teamId: string | null;
  position: Position;
  status: PlayerStatus;
  statusNote: string | null;
  /** 0..1, null si no hay dato fiable */
  startProb: number | null;
  value: number | null;
  sourceHistory: SourceHistory | null;
  /** Días consecutivos de racha (positivo sube, negativo baja) según la fuente */
  sourceStreakDays: number | null;
  /** Aceleración publicada por la fuente (diferencia de variaciones diarias) */
  sourceAcceleration: number | null;
  nextOpponentId: string | null;
  nextHome: boolean | null;
  nextMatchday: number | null;
  pointsTotal: number | null;
  pointsAvg: number | null;
  points5: number | null;
  played5: number | null;
  matchesPlayed: number | null;
  lastPoints: number | null;
  /** Tarjetas en la temporada y si está a una amarilla de sanción (FútbolFantasy) */
  yellowCards: number | null;
  redCards: number | null;
  warned: boolean | null;
  source: DataSource;
  sourceId: string | null;
  updatedAt: string;
  /** Campos que el usuario ha editado a mano (prevalecen sobre la sincronización) */
  overridden: (keyof PlayerOverride)[];
}

export interface PlayerOverride {
  value?: number | null;
  status?: PlayerStatus;
  startProb?: number | null;
  position?: Position;
  teamId?: string | null;
  statusNote?: string | null;
}

export interface PriceSnapshot {
  playerId: string;
  date: string; // YYYY-MM-DD
  value: number;
  source: DataSource;
}

export interface SquadEntry {
  playerId: string;
  purchasePrice: number;
  purchaseDate: string;
  notes: string | null;
}

export type TransactionType = "compra" | "venta" | "ajuste";
export interface Transaction {
  id: number;
  type: TransactionType;
  playerId: string | null;
  playerName: string;
  amount: number; // siempre positivo; el tipo indica el signo
  /** En ventas: precio de compra del jugador vendido */
  costBasis: number | null;
  date: string;
  notes: string | null;
}

export interface MarketListing {
  id: number;
  date: string;
  playerId: string;
  askingPrice: number | null;
  seller: string | null;
}

export interface Fixture {
  id: string;
  season: string;
  matchday: number;
  kickoff: string | null; // ISO con zona horaria si se conoce la hora
  date: string; // YYYY-MM-DD
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  source: DataSource;
  updatedAt: string;
}

export type LineupRole = "titular" | "suplente" | "duda" | "lesionado" | "sancionado";
export interface ProbableLineupEntry {
  id: number;
  matchday: number;
  teamId: string;
  playerName: string;
  playerId: string | null;
  role: LineupRole;
  probability: number | null; // 0..1
  source: DataSource;
  updatedAt: string;
  manual: boolean;
}

export type Formation = "3-4-3" | "3-5-2" | "4-3-3" | "4-4-2" | "4-5-1" | "5-3-2" | "5-4-1";
export const FORMATIONS: Formation[] = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"];

export interface LineupSlot {
  slot: string; // p.ej. "DEF-2"
  position: Position;
  playerId: string | null;
}

export interface Settings {
  budget: number;
  formation: Formation;
  lineup: Record<string, string | null>; // slot -> playerId
  useCoach: boolean;
  maxSquadSize: number;
  teamName: string;
}

export interface SyncLogEntry {
  id: number;
  source: string;
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  status: "ok" | "error" | "skipped" | "running";
  message: string | null;
  count: number | null;
}

export interface SquadValuePoint {
  date: string;
  squadValue: number;
  budget: number;
}

export type Workspace = "real" | "demo";
