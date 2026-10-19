import type { PlayerStatus, Position } from "./types";

/** Minúsculas, sin tildes ni signos; espacios simples. Clave de cruce entre fuentes. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "nemanja-gudelj" -> "nemanja gudelj" */
export function slugToName(slug: string): string {
  return normalizeName(slug.replace(/-/g, " "));
}

export function playerIdFor(source: string, sourceId: string | number): string {
  return `${source}:${sourceId}`;
}

const POSITION_ALIASES: Record<string, Position> = {
  por: "POR", portero: "POR", gk: "POR", goalkeeper: "POR",
  def: "DEF", defensa: "DEF", df: "DEF", defender: "DEF", lateral: "DEF", central: "DEF",
  med: "MED", mediocampista: "MED", centrocampista: "MED", mc: "MED", mid: "MED", midfielder: "MED", medio: "MED",
  del: "DEL", delantero: "DEL", dc: "DEL", fw: "DEL", forward: "DEL", atacante: "DEL",
  ent: "ENT", entrenador: "ENT", coach: "ENT", dt: "ENT",
};

export function parsePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  return POSITION_ALIASES[normalizeName(raw)] ?? null;
}

const STATUS_ALIASES: Record<string, PlayerStatus> = {
  disponible: "disponible", ok: "disponible", apto: "disponible", available: "disponible",
  duda: "duda", dudoso: "duda", doubtful: "duda",
  lesionado: "lesionado", lesion: "lesionado", injured: "lesionado", baja: "lesionado",
  sancionado: "sancionado", sancion: "sancionado", suspended: "sancionado",
  desconocido: "desconocido", "": "desconocido",
};

export function parseStatus(raw: string | null | undefined): PlayerStatus | null {
  if (raw == null) return null;
  return STATUS_ALIASES[normalizeName(raw)] ?? null;
}

/** Acepta "1.234.567", "1,5M", "750k", "1234567", "1.234.567 €" */
export function parseMoney(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  let s = raw.trim().toLowerCase().replace(/€|eur/g, "").replace(/\s/g, "");
  if (!s) return null;
  let mult = 1;
  if (s.endsWith("m")) { mult = 1_000_000; s = s.slice(0, -1); }
  else if (s.endsWith("k")) { mult = 1_000; s = s.slice(0, -1); }
  if (mult > 1) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * mult);
}
