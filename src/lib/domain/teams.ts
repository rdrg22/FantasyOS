import { normalizeName } from "./normalize";

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Identificador numérico de FútbolFantasy */
  ffId: number;
  aliases: string[];
}

// Equipos de Primera División 2026/27 (verificados contra openfootball y FútbolFantasy el 19/10/2026).
export const TEAMS: Team[] = [
  { id: "alaves", name: "Alavés", short: "ALA", color: "#1d4ed8", ffId: 28, aliases: ["Deportivo Alavés", "Alaves"] },
  { id: "athletic", name: "Athletic", short: "ATH", color: "#dc2626", ffId: 1, aliases: ["Athletic Club", "Athletic Bilbao"] },
  { id: "atletico", name: "Atlético", short: "ATM", color: "#b91c1c", ffId: 2, aliases: ["Club Atlético de Madrid", "Atlético de Madrid", "Atletico Madrid", "Atlético Madrid"] },
  { id: "barcelona", name: "Barcelona", short: "BAR", color: "#1e3a8a", ffId: 3, aliases: ["FC Barcelona", "Barça"] },
  { id: "betis", name: "Betis", short: "BET", color: "#15803d", ffId: 4, aliases: ["Real Betis Balompié", "Real Betis"] },
  { id: "celta", name: "Celta", short: "CEL", color: "#38bdf8", ffId: 5, aliases: ["RC Celta de Vigo", "Celta de Vigo", "Celta Vigo"] },
  { id: "deportivo", name: "Deportivo", short: "DEP", color: "#2563eb", ffId: 6, aliases: ["RC Deportivo La Coruña", "Deportivo La Coruña", "Dépor", "Deportivo de La Coruña"] },
  { id: "elche", name: "Elche", short: "ELC", color: "#16a34a", ffId: 21, aliases: ["Elche CF"] },
  { id: "espanyol", name: "Espanyol", short: "ESP", color: "#0ea5e9", ffId: 7, aliases: ["RCD Espanyol de Barcelona", "RCD Espanyol"] },
  { id: "getafe", name: "Getafe", short: "GET", color: "#1e40af", ffId: 8, aliases: ["Getafe CF"] },
  { id: "levante", name: "Levante", short: "LEV", color: "#7f1d1d", ffId: 10, aliases: ["Levante UD"] },
  { id: "malaga", name: "Málaga", short: "MAL", color: "#0284c7", ffId: 11, aliases: ["Málaga CF", "Malaga"] },
  { id: "osasuna", name: "Osasuna", short: "OSA", color: "#991b1b", ffId: 13, aliases: ["CA Osasuna"] },
  { id: "racing", name: "Racing", short: "RAC", color: "#059669", ffId: 42, aliases: ["Real Racing Club de Santander", "Racing de Santander", "Racing Santander"] },
  { id: "rayo", name: "Rayo", short: "RAY", color: "#e11d48", ffId: 14, aliases: ["Rayo Vallecano de Madrid", "Rayo Vallecano"] },
  { id: "real-madrid", name: "Real Madrid", short: "RMA", color: "#e5e7eb", ffId: 15, aliases: ["Real Madrid CF"] },
  { id: "real-sociedad", name: "Real Sociedad", short: "RSO", color: "#2563eb", ffId: 16, aliases: ["Real Sociedad de Fútbol", "R. Sociedad"] },
  { id: "sevilla", name: "Sevilla", short: "SEV", color: "#f87171", ffId: 17, aliases: ["Sevilla FC"] },
  { id: "valencia", name: "Valencia", short: "VAL", color: "#f59e0b", ffId: 18, aliases: ["Valencia CF"] },
  { id: "villarreal", name: "Villarreal", short: "VIL", color: "#eab308", ffId: 22, aliases: ["Villarreal CF"] },
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
