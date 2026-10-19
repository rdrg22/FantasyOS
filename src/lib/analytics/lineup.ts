import type { Formation, Position } from "../domain/types";
import { FORMATIONS } from "../domain/types";
import { formationCounts, formationSlots } from "../domain/formations";
import type { PlayerAnalysis } from "./analysis";

export interface RecommendedSlot {
  slot: string;
  position: Position;
  playerId: string | null;
  xp: number;
  reasons: string[];
}

export interface FormationOption {
  formation: Formation;
  total: number;
  complete: boolean;
  missing: number;
}

export interface LineupRecommendation {
  formation: Formation;
  slots: RecommendedSlot[];
  total: number;
  options: FormationOption[];
  /** Alternativas por línea (no titulares), ordenadas por puntos esperados */
  bench: Record<Position, { playerId: string; xp: number; why: string }[]>;
}

export interface LineupIssue {
  slot: string;
  playerId: string | null;
  severity: "alta" | "media" | "baja";
  message: string;
  suggestion: string | null;
}

export interface LineupComparison {
  currentTotal: number;
  recommendedTotal: number;
  delta: number;
  issues: LineupIssue[];
  changes: { out: string | null; in: string | null; position: Position; gain: number }[];
}

const byXp = (a: PlayerAnalysis, b: PlayerAnalysis) => b.xp - a.xp || b.pPlay - a.pPlay || (b.player.pointsAvg ?? 0) - (a.player.pointsAvg ?? 0);

export function explainPick(a: PlayerAnalysis): string[] {
  const r: string[] = [];
  r.push(`${a.xp.toFixed(1)} pts esperados`);
  if (a.pPlaySource !== "supuesto") r.push(`${Math.round(a.pPlay * 100)}% de jugar${a.pPlaySource === "alineacion-probable" ? " (alineación probable)" : ""}`);
  else r.push("sin dato fiable de titularidad");
  if (a.basePointsSource !== "supuesto") r.push(`media ${a.basePoints.toFixed(1)} pts/partido`);
  if (a.difficulty != null) r.push(`rival de dificultad ${a.difficulty}/5${a.home === true ? " en casa" : a.home === false ? " fuera" : ""}`);
  if (a.player.status === "duda") r.push("estado: duda");
  return r;
}

function pickForFormation(pool: PlayerAnalysis[], f: Formation, useCoach: boolean) {
  const counts: Record<Position, number> = { POR: 1, ...formationCounts(f), ENT: useCoach ? 1 : 0 };
  const chosen: Record<Position, PlayerAnalysis[]> = { POR: [], DEF: [], MED: [], DEL: [], ENT: [] };
  let total = 0;
  let missing = 0;
  for (const pos of Object.keys(counts) as Position[]) {
    const cand = pool.filter((a) => a.player.position === pos).sort(byXp);
    chosen[pos] = cand.slice(0, counts[pos]);
    missing += Math.max(0, counts[pos] - chosen[pos].length);
    total += chosen[pos].reduce((s, a) => s + a.xp, 0);
  }
  return { chosen, total, missing };
}

/** El reparto óptimo por línea es independiente, así que basta con probar cada formación. */
export function recommendLineup(squad: PlayerAnalysis[], useCoach: boolean): LineupRecommendation {
  const options: FormationOption[] = [];
  let best: { f: Formation; r: ReturnType<typeof pickForFormation> } | null = null;
  for (const f of FORMATIONS) {
    const r = pickForFormation(squad, f, useCoach);
    options.push({ formation: f, total: r.total, complete: r.missing === 0, missing: r.missing });
    const better =
      !best ||
      (r.missing < best.r.missing) ||
      (r.missing === best.r.missing && r.total > best.r.total + 1e-9);
    if (better) best = { f, r };
  }
  options.sort((a, b) => Number(b.complete) - Number(a.complete) || b.total - a.total);
  const { f, r } = best!;
  const slots: RecommendedSlot[] = formationSlots(f, useCoach).map((s) => {
    const idx = Number(s.slot.split("-")[1]) - 1;
    const a = r.chosen[s.position][idx];
    return { slot: s.slot, position: s.position, playerId: a?.player.id ?? null, xp: a?.xp ?? 0, reasons: a ? explainPick(a) : ["Sin jugador disponible para esta posición"] };
  });
  const starters = new Set(slots.map((s) => s.playerId).filter(Boolean));
  const bench: LineupRecommendation["bench"] = { POR: [], DEF: [], MED: [], DEL: [], ENT: [] };
  for (const a of [...squad].sort(byXp)) {
    if (starters.has(a.player.id)) continue;
    const why =
      a.pPlay === 0
        ? a.noMatch ? "su equipo no juega esta jornada" : `no disponible (${a.player.status})`
        : `${a.xp.toFixed(1)} pts esperados, por debajo de los titulares`;
    bench[a.player.position].push({ playerId: a.player.id, xp: a.xp, why });
  }
  return { formation: f, slots, total: r.total, options, bench };
}

/** Compara la alineación guardada con la recomendada y detecta riesgos. */
export function compareLineup(
  current: Record<string, string | null>,
  analyses: Map<string, PlayerAnalysis>,
  rec: LineupRecommendation,
  squadIds: Set<string>,
): LineupComparison {
  const issues: LineupIssue[] = [];
  let currentTotal = 0;
  const benchByPos = rec.bench;
  const usedIds = new Set(Object.values(current).filter(Boolean) as string[]);
  const bestAlt = (pos: Position) => {
    const alt = [...benchByPos[pos], ...rec.slots.filter((s) => s.position === pos && s.playerId && !usedIds.has(s.playerId)).map((s) => ({ playerId: s.playerId!, xp: s.xp, why: "" }))]
      .filter((x) => !usedIds.has(x.playerId))
      .sort((a, b) => b.xp - a.xp)[0];
    return alt && alt.xp > 0 ? alt : null;
  };

  const suggest = (pos: Position) => {
    const alt = bestAlt(pos);
    if (alt) usedIds.add(alt.playerId);
    return alt?.playerId ?? null;
  };

  for (const [slot, pid] of Object.entries(current)) {
    const pos = slot.split("-")[0] as Position;
    if (!pid) {
      // Solo es accionable si hay alguien en la plantilla para cubrirlo.
      const alt = bestAlt(pos);
      if (alt) {
        issues.push({ slot, playerId: null, severity: "alta", message: `Hueco ${slot} vacío: puntuará 0.`, suggestion: alt.playerId });
        usedIds.add(alt.playerId);
      }
      continue;
    }
    if (!squadIds.has(pid)) {
      issues.push({ slot, playerId: pid, severity: "alta", message: "Este jugador ya no está en tu plantilla.", suggestion: suggest(pos) });
      continue;
    }
    const a = analyses.get(pid);
    if (!a) continue;
    currentTotal += a.xp;
    const name = a.player.name;
    if (a.noMatch) issues.push({ slot, playerId: pid, severity: "alta", message: `${name}: su equipo no juega esta jornada.`, suggestion: suggest(pos) });
    else if (a.player.status === "lesionado" || a.player.status === "sancionado")
      issues.push({ slot, playerId: pid, severity: "alta", message: `${name} está ${a.player.status}.`, suggestion: suggest(pos) });
    else if (a.pPlaySource !== "supuesto" && a.pPlay < 0.4)
      issues.push({ slot, playerId: pid, severity: "media", message: `${name} tiene solo un ${Math.round(a.pPlay * 100)}% de probabilidad estimada de jugar.`, suggestion: suggest(pos) });
    else if (a.player.status === "duda")
      issues.push({ slot, playerId: pid, severity: "media", message: `${name} es duda para la jornada.`, suggestion: suggest(pos) });
  }

  const currentIds = new Set(Object.values(current).filter(Boolean) as string[]);
  const recIds = new Set(rec.slots.map((s) => s.playerId).filter(Boolean) as string[]);
  const outs = [...currentIds].filter((id) => !recIds.has(id));
  const ins = [...recIds].filter((id) => !currentIds.has(id));
  const changes: LineupComparison["changes"] = [];
  for (const inId of ins) {
    const a = analyses.get(inId)!;
    const outIdx = outs.findIndex((o) => analyses.get(o)?.player.position === a.player.position);
    const outId = outIdx >= 0 ? outs.splice(outIdx, 1)[0] : null;
    changes.push({ in: inId, out: outId, position: a.player.position, gain: a.xp - (outId ? analyses.get(outId)?.xp ?? 0 : 0) });
  }
  for (const o of outs) changes.push({ in: null, out: o, position: analyses.get(o)?.player.position ?? "MED", gain: -(analyses.get(o)?.xp ?? 0) });

  return { currentTotal, recommendedTotal: rec.total, delta: rec.total - currentTotal, issues, changes };
}
