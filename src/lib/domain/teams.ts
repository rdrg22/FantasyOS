import { normalizeName } from "./normalize";

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Identificador numérico de FútbolFantasy */
  ffId: number;
  aliases: string[];
  /** Camiseta simplificada para los iconos (colores aproximados, sin escudos ni marcas). */
  kit: Kit;
}

export interface Kit {
  pattern: "solid" | "stripes" | "band" | "sash";
  /** Color base del cuerpo */
  body: string;
  /** Segundo color: rayas, franja o banda */
  alt: string;
  /** Cuello y bocamangas */
  trim: string;
}

// Equipos de Primera División 2026/27 (verificados contra openfootball y FútbolFantasy el 19/10/2026).
export const TEAMS: Team[] = [
  { id: "alaves", name: "Alavés", short: "ALA", color: "#1d4ed8", ffId: 28, kit: { pattern: "stripes", body: "#1d4ed8", alt: "#ffffff", trim: "#1d4ed8" }, aliases: ["Deportivo Alavés", "Alaves"] },
  { id: "athletic", name: "Athletic", short: "ATH", color: "#dc2626", ffId: 1, kit: { pattern: "stripes", body: "#d1121a", alt: "#ffffff", trim: "#111111" }, aliases: ["Athletic Club", "Athletic Bilbao"] },
  { id: "atletico", name: "Atlético", short: "ATM", color: "#b91c1c", ffId: 2, kit: { pattern: "stripes", body: "#cb2026", alt: "#ffffff", trim: "#1e3a8a" }, aliases: ["Club Atlético de Madrid", "Atlético de Madrid", "Atletico Madrid", "Atlético Madrid"] },
  { id: "barcelona", name: "Barcelona", short: "BAR", color: "#1e3a8a", ffId: 3, kit: { pattern: "stripes", body: "#1546a8", alt: "#d0103a", trim: "#edbb00" }, aliases: ["FC Barcelona", "Barça"] },
  { id: "betis", name: "Betis", short: "BET", color: "#15803d", ffId: 4, kit: { pattern: "stripes", body: "#0b9444", alt: "#ffffff", trim: "#0b9444" }, aliases: ["Real Betis Balompié", "Real Betis"] },
  { id: "celta", name: "Celta", short: "CEL", color: "#38bdf8", ffId: 5, kit: { pattern: "solid", body: "#8ac3ee", alt: "#8ac3ee", trim: "#c8102e" }, aliases: ["RC Celta de Vigo", "Celta de Vigo", "Celta Vigo"] },
  { id: "deportivo", name: "Deportivo", short: "DEP", color: "#2563eb", ffId: 6, kit: { pattern: "stripes", body: "#1d4ed8", alt: "#ffffff", trim: "#1d4ed8" }, aliases: ["RC Deportivo La Coruña", "Deportivo La Coruña", "Dépor", "Deportivo de La Coruña"] },
  { id: "elche", name: "Elche", short: "ELC", color: "#16a34a", ffId: 21, kit: { pattern: "band", body: "#ffffff", alt: "#0a8a3c", trim: "#0a8a3c" }, aliases: ["Elche CF"] },
  { id: "espanyol", name: "Espanyol", short: "ESP", color: "#0ea5e9", ffId: 7, kit: { pattern: "stripes", body: "#0072ce", alt: "#ffffff", trim: "#0072ce" }, aliases: ["RCD Espanyol de Barcelona", "RCD Espanyol"] },
  { id: "getafe", name: "Getafe", short: "GET", color: "#1e40af", ffId: 8, kit: { pattern: "solid", body: "#005999", alt: "#005999", trim: "#ffffff" }, aliases: ["Getafe CF"] },
  { id: "levante", name: "Levante", short: "LEV", color: "#7f1d1d", ffId: 10, kit: { pattern: "stripes", body: "#c8103c", alt: "#1546a8", trim: "#b4053f" }, aliases: ["Levante UD"] },
  { id: "malaga", name: "Málaga", short: "MAL", color: "#0284c7", ffId: 11, kit: { pattern: "stripes", body: "#0f6ab4", alt: "#ffffff", trim: "#0f6ab4" }, aliases: ["Málaga CF", "Malaga"] },
  { id: "osasuna", name: "Osasuna", short: "OSA", color: "#991b1b", ffId: 13, kit: { pattern: "solid", body: "#d91a21", alt: "#d91a21", trim: "#0a1f44" }, aliases: ["CA Osasuna"] },
  { id: "racing", name: "Racing", short: "RAC", color: "#059669", ffId: 42, kit: { pattern: "solid", body: "#ffffff", alt: "#ffffff", trim: "#00843d" }, aliases: ["Real Racing Club de Santander", "Racing de Santander", "Racing Santander"] },
  { id: "rayo", name: "Rayo", short: "RAY", color: "#e11d48", ffId: 14, kit: { pattern: "sash", body: "#ffffff", alt: "#e1261c", trim: "#e1261c" }, aliases: ["Rayo Vallecano de Madrid", "Rayo Vallecano"] },
  { id: "real-madrid", name: "Real Madrid", short: "RMA", color: "#e5e7eb", ffId: 15, kit: { pattern: "solid", body: "#ffffff", alt: "#ffffff", trim: "#c9a227" }, aliases: ["Real Madrid CF"] },
  { id: "real-sociedad", name: "Real Sociedad", short: "RSO", color: "#2563eb", ffId: 16, kit: { pattern: "stripes", body: "#0067b1", alt: "#ffffff", trim: "#0067b1" }, aliases: ["Real Sociedad de Fútbol", "R. Sociedad"] },
  { id: "sevilla", name: "Sevilla", short: "SEV", color: "#f87171", ffId: 17, kit: { pattern: "solid", body: "#ffffff", alt: "#ffffff", trim: "#d71920" }, aliases: ["Sevilla FC"] },
  { id: "valencia", name: "Valencia", short: "VAL", color: "#f59e0b", ffId: 18, kit: { pattern: "solid", body: "#ffffff", alt: "#ffffff", trim: "#ee7f00" }, aliases: ["Valencia CF"] },
  { id: "villarreal", name: "Villarreal", short: "VIL", color: "#eab308", ffId: 22, kit: { pattern: "solid", body: "#ffe114", alt: "#ffe114", trim: "#1d4ed8" }, aliases: ["Villarreal CF"] },
];

const byId = new Map(TEAMS.map((t) => [t.id, t]));
const byFf = new Map(TEAMS.map((t) => [t.ffId, t]));
const byAlias = new Map<string, Team>();
for (const t of TEAMS) {
  for (const a of [t.id, t.name, t.short, ...t.aliases]) byAlias.set(normalizeName(a), t);
}

export function getTeam(id: string | null | undefined): Team | undefined {
  return id ? byId.get(id) : undefined;
}

export function teamByFfId(ffId: number): Team | undefined {
  return byFf.get(ffId);
}

/** Resuelve un nombre de equipo en cualquier formato conocido a su id canónico. */
export function resolveTeamId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normalizeName(raw);
  return byAlias.get(n)?.id ?? byAlias.get(n.replace(/-/g, " "))?.id ?? null;
}

export function teamName(id: string | null | undefined): string {
  return getTeam(id)?.name ?? "—";
}
