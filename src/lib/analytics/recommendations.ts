import type { MarketListing, Position, Settings, SquadEntry } from "../domain/types";
import { POSITION_LABEL } from "../domain/types";
import { fmtMoney, fmtPct } from "../domain/money";
import type { ConfidenceLevel, PlayerAnalysis } from "./analysis";
import type { LineupComparison, LineupRecommendation } from "./lineup";
import { computeBid, type BidAdvice, type BidContext } from "./bidding";

export type Action = "COMPRAR" | "VENDER" | "MANTENER" | "VIGILAR" | "ALINEAR" | "SALDO";
export type Intent = "revalorizacion" | "puntos" | "mixta";

export interface Recommendation {
  id: string;
  action: Action;
  priority: number; // 0..100
  playerId: string | null;
  playerName: string;
  position: Position | null;
  price: number | null;
  intent: Intent | null;
  title: string;
  reasons: string[];
  benefits: string[];
  risks: string[];
  budget: { before: number; cost: number; income: number; after: number; feasible: boolean; note: string | null };
  lineupImpact: string;
  replaces: { playerId: string; playerName: string; saleValue: number } | null;
  confidence: { level: ConfidenceLevel; used: string[]; missing: string[] };
  inMyMarket: boolean | null;
  /** Asesor de puja (solo fichajes) */
  bid?: BidAdvice | null;
}

export interface EngineInput {
  analyses: Map<string, PlayerAnalysis>;
  squad: SquadEntry[];
  settings: Settings;
  listings: MarketListing[];
  lineupRec: LineupRecommendation;
  lineupCmp: LineupComparison | null;
  bidContext?: BidContext;
}

/** Puntos esperados extra en las 2 próximas jornadas frente al titular más flojo de su línea en tu once recomendado. */
export function pointsGain2(a: PlayerAnalysis, lineupRec: LineupRecommendation, analyses: Map<string, PlayerAnalysis>): number {
  const slots = lineupRec.slots.filter((s) => s.position === a.player.position);
  if (slots.length === 0) return 0;
  const taken = slots.filter((s) => s.playerId).map((s) => analyses.get(s.playerId!)?.xp2 ?? 0);
  if (taken.length < slots.length || taken.length === 0) return a.xp2;
  return a.xp2 - Math.min(...taken);
}

// Mínimos por línea para poder alinear al menos una formación válida.
const MIN_BY_POS: Record<Position, number> = { POR: 1, DEF: 3, MED: 3, DEL: 1, ENT: 0 };

const currentValue = (a: PlayerAnalysis, e?: SquadEntry) => a.trend.value ?? e?.purchasePrice ?? 0;

function lowerConfidence(l: ConfidenceLevel): ConfidenceLevel {
  return l === "alta" ? "media" : "baja";
}

function trendText(a: PlayerAnalysis): string {
  const t = a.trend;
  const bits: string[] = [];
  if (t.pct1 != null) bits.push(`${fmtPct(t.pct1)} en el último mercado`);
  if (t.pct3 != null) bits.push(`${fmtPct(t.pct3)} en 3 días`);
  if (t.pct7 != null) bits.push(`${fmtPct(t.pct7)} en 7 días`);
  return bits.length ? bits.join(", ") : "sin histórico de precios suficiente";
}

function accelText(a: PlayerAnalysis): string | null {
  switch (a.trend.accelLabel) {
    case "acelera": return a.trend.dailyRate! >= 0 ? "la subida se está acelerando" : "la caída se está acelerando";
    case "desacelera": return a.trend.dailyRate! >= 0 ? "la subida pierde fuerza" : "la caída se está frenando";
    case "inflexion-positiva": return "cambio de tendencia al alza tras días bajando";
    case "inflexion-negativa": return "cambio de tendencia a la baja tras días subiendo";
    default: return null;
  }
}

export function generateRecommendations(input: EngineInput): Recommendation[] {
  const { analyses, squad, settings, listings, lineupRec, lineupCmp } = input;
  const budget = settings.budget;
  const recs: Recommendation[] = [];
  const squadIds = new Set(squad.map((s) => s.playerId));
  const squadA = squad.map((e) => ({ e, a: analyses.get(e.playerId) })).filter((x): x is { e: SquadEntry; a: PlayerAnalysis } => Boolean(x.a));
  const starterIds = new Set(lineupRec.slots.map((s) => s.playerId).filter(Boolean) as string[]);
  const countByPos: Record<Position, number> = { POR: 0, DEF: 0, MED: 0, DEL: 0, ENT: 0 };
  for (const { a } of squadA) countByPos[a.player.position]++;

  const starterOf = (pos: Position) => lineupRec.slots.filter((s) => s.position === pos && s.playerId).sort((x, y) => x.xp - y.xp);
  const weakestStarter = (pos: Position) => starterOf(pos)[0] ?? null;
  const slotsFor = (pos: Position) => lineupRec.slots.filter((s) => s.position === pos).length;
  const nameOf = (id: string | null) => (id ? analyses.get(id)?.player.name ?? "—" : "—");

  // ── 0. Saldo negativo ──
  if (budget < 0) {
    recs.push({
      id: "saldo-negativo",
      action: "SALDO",
      priority: 100,
      playerId: null,
      playerName: "Saldo negativo",
      position: null,
      price: null,
      intent: null,
      title: `Tu saldo es negativo (${fmtMoney(budget)})`,
      reasons: ["LaLiga Fantasy penaliza empezar la jornada con saldo negativo: tu equipo no puntúa."],
      benefits: ["Vender antes del cierre de la jornada evita perder todos los puntos."],
      risks: ["Vender con prisa puede obligarte a desprenderte de un jugador que está subiendo."],
      budget: { before: budget, cost: 0, income: 0, after: budget, feasible: false, note: `Necesitas ingresar al menos ${fmtMoney(-budget)}.` },
      lineupImpact: "Mira las ventas recomendadas: priorizan suplentes con peor perspectiva.",
      replaces: null,
      confidence: { level: "alta", used: ["saldo introducido"], missing: [] },
      inMyMarket: null,
    });
  }

  // ── 1. Problemas en la alineación guardada ──
  if (lineupCmp) {
    for (const issue of lineupCmp.issues.filter((i) => i.severity !== "baja")) {
      const sug = issue.suggestion ? analyses.get(issue.suggestion) : null;
      recs.push({
        id: `alinear-${issue.slot}`,
        action: "ALINEAR",
        priority: issue.severity === "alta" ? 92 : 72,
        playerId: issue.playerId,
        playerName: issue.playerId ? nameOf(issue.playerId) : `Hueco ${issue.slot}`,
        position: (issue.slot.split("-")[0] as Position) ?? null,
        price: null,
        intent: null,
        title: sug ? `Cambia tu once: ${issue.playerId ? nameOf(issue.playerId) : issue.slot} → ${sug.player.name}` : `Revisa tu once: ${issue.message}`,
        reasons: [issue.message],
        benefits: sug ? [`${sug.player.name} aporta ${sug.xp.toFixed(1)} pts esperados con ${Math.round(sug.pPlay * 100)}% de jugar.`] : [],
        risks: ["Las alineaciones probables pueden cambiar hasta el inicio del partido; no son oficiales."],
        budget: { before: budget, cost: 0, income: 0, after: budget, feasible: true, note: "Sin coste" },
        lineupImpact: sug ? `Ganancia estimada: +${(sug.xp - (issue.playerId ? analyses.get(issue.playerId)?.xp ?? 0 : 0)).toFixed(1)} pts` : "Sin alternativa clara en tu plantilla.",
        replaces: null,
        confidence: { level: sug?.confidence.level ?? "media", used: ["alineación guardada", ...(sug?.confidence.used ?? [])], missing: sug?.confidence.missing ?? [] },
        inMyMarket: null,
      });
    }
  }

  // ── 2. Jugadores de mi plantilla: VENDER / VIGILAR / MANTENER ──
  for (const { e, a } of squadA) {
    const p = a.player;
    const value = currentValue(a, e);
    const profit = value - e.purchasePrice;
    const t = a.trend;
    const isStarter = starterIds.has(p.id);
    const unavailable = p.status === "lesionado" || p.status === "sancionado";
    const falling = t.direction === "baja";
    const crash = (t.pct3 != null && t.pct3 <= -4) || (falling && t.accelLabel === "acelera") || t.accelLabel === "inflexion-negativa";
    const lowPlay = a.pPlaySource !== "supuesto" && a.pPlay < 0.3;
    const depthOk = countByPos[p.position] - 1 >= MIN_BY_POS[p.position];

    const reasons: string[] = [];
    const risks: string[] = [];
    const benefits: string[] = [];
    reasons.push(`Valor: ${trendText(a)}.`);
    const acc = accelText(a);
    if (acc) reasons.push(`Señal de aceleración: ${acc}.`);
    if (unavailable) reasons.push(`Está ${p.status}${p.statusNote ? ` (${p.statusNote})` : ""}.`);
    else if (a.pPlaySource !== "supuesto") reasons.push(`Probabilidad estimada de jugar: ${Math.round(a.pPlay * 100)}%.`);
    reasons.push(isStarter ? `Está en tu once recomendado (${a.xp.toFixed(1)} pts esperados).` : `No entra en tu once recomendado (${a.xp.toFixed(1)} pts esperados).`);

    let action: Action;
    let priority: number;
    const sellScore =
      (crash ? 35 : 0) + (falling ? 15 : 0) + (unavailable ? 20 : 0) + (lowPlay ? 15 : 0) + (!isStarter ? 10 : -25) + Math.max(0, -a.momentum) * 0.3 + (budget < 0 ? 20 : 0);

    if (sellScore >= 45 && depthOk) {
      action = "VENDER";
      priority = Math.min(95, 45 + sellScore * 0.5);
      benefits.push(`Ingresas ${fmtMoney(value)} (${profit >= 0 ? "ganancia" : "pérdida"} de ${fmtMoney(Math.abs(profit))} sobre tu compra).`);
      if (t.dailyRate != null && t.dailyRate < 0) {
        const est = Math.round(value * (Math.abs(t.dailyRate) / 100) * 3 * 0.7);
        benefits.push(`Si la tendencia se mantuviera, podría perder del orden de ${fmtMoney(est)} en 3 días (estimación, no garantizada).`);
      }
      if (unavailable) benefits.push("Liberas una plaza ocupada por un jugador que no puntuará.");
      risks.push("Los precios rebotan con frecuencia; si vuelve a jugar o marca, podría recuperar valor.");
      if (isStarter) risks.push("Perderías a un titular de tu once recomendado.");
      if (countByPos[p.position] - 1 <= MIN_BY_POS[p.position]) risks.push(`Te quedarías con el mínimo de ${POSITION_LABEL[p.position].toLowerCase()}s para alinear.`);
    } else if (falling || unavailable || lowPlay || p.status === "duda") {
      action = "VIGILAR";
      priority = 35 + (unavailable ? 15 : 0) + (falling ? 10 : 0) + (isStarter ? 5 : 0);
      if (!depthOk && sellScore >= 45) reasons.push("Venderlo te dejaría sin suficientes jugadores en su línea; busca antes un sustituto.");
      benefits.push("Mantenerlo conserva tu profundidad de plantilla mientras se aclara su situación.");
      risks.push(falling ? "Su valor está bajando: cada día de espera puede costar dinero." : "Su participación en la próxima jornada es incierta.");
    } else {
      action = "MANTENER";
      priority = 15 + (t.direction === "sube" ? 10 : 0) + (isStarter ? 5 : 0);
      if (t.direction === "sube") benefits.push("Su valor está subiendo: mantenerlo acumula revalorización.");
      if (isStarter) benefits.push("Es pieza de tu once recomendado.");
      risks.push(t.accelLabel === "desacelera" ? "La subida pierde fuerza; vigila un posible cambio de tendencia." : "Sin riesgos destacados con los datos disponibles.");
    }

    let lineupImpact = "No afecta a tu once recomendado.";
    if (action === "VENDER" && isStarter) {
      const alt = lineupRec.bench[p.position][0];
      lineupImpact = alt ? `Saldría de tu once; lo sustituiría ${nameOf(alt.playerId)} (${(alt.xp - a.xp).toFixed(1)} pts esperados).` : "Saldría de tu once sin sustituto en la plantilla.";
    } else if (isStarter) lineupImpact = "Titular en tu once recomendado.";

    recs.push({
      id: `${action.toLowerCase()}-${p.id}`,
      action,
      priority: Math.round(priority),
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      price: value,
      intent: null,
      title:
        action === "VENDER" ? `Vender a ${p.name}` : action === "VIGILAR" ? `Vigilar a ${p.name}` : `Mantener a ${p.name}`,
      reasons,
      benefits,
      risks,
      budget:
        action === "VENDER"
          ? { before: budget, cost: 0, income: value, after: budget + value, feasible: true, note: null }
          : { before: budget, cost: 0, income: 0, after: budget, feasible: true, note: null },
      lineupImpact,
      replaces: null,
      confidence: { level: a.confidence.level, used: a.confidence.used, missing: a.confidence.missing },
      inMyMarket: null,
    });
  }

  // ── 3. Mercado: COMPRAR / VIGILAR ──
  const latestDate = listings.reduce<string | null>((m, l) => (m == null || l.date > m ? l.date : m), null);
  const todays = listings.filter((l) => l.date === latestDate);
  const fromListings = todays.length > 0;
  const listingBy = new Map(todays.map((l) => [l.playerId, l]));
  let pool: PlayerAnalysis[];
  if (fromListings) {
    pool = todays.map((l) => analyses.get(l.playerId)).filter((x): x is PlayerAnalysis => Boolean(x));
  } else {
    pool = [...analyses.values()]
      .filter((a) => a.trend.value != null)
      .sort((x, y) => y.opportunity - x.opportunity)
      .slice(0, 60);
  }

  const squadFull = squad.length >= settings.maxSquadSize;
  const buyRecs: Recommendation[] = [];
  const watchRecs: Recommendation[] = [];

  for (const a of pool) {
    const p = a.player;
    if (squadIds.has(p.id)) continue;
    if (p.status === "lesionado" || p.status === "sancionado") continue;
    const listing = listingBy.get(p.id);
    const cost = listing?.askingPrice ?? a.trend.value;
    if (cost == null || cost <= 0) continue;

    const valueCase = a.trend.direction === "sube" && a.momentum >= 12 && a.pPlay >= 0.3;
    const weakest = weakestStarter(p.position);
    const needSlots = slotsFor(p.position) > starterOf(p.position).length;
    const gain = needSlots ? a.xp : weakest ? a.xp - weakest.xp : a.xp;
    const pointsCase = slotsFor(p.position) > 0 && gain >= 0.8 && a.pPlay >= 0.5;
    if (!valueCase && !pointsCase) continue;
    const intent: Intent = valueCase && pointsCase ? "mixta" : valueCase ? "revalorizacion" : "puntos";

    // Viabilidad económica
    let replaces: Recommendation["replaces"] = null;
    let feasible = budget >= cost && !squadFull;
    let note: string | null = null;
    if (!feasible) {
      const candidates = squadA
        .filter(({ a: s }) => {
          const pos = s.player.position;
          const leavesDepth = countByPos[pos] - 1 + (pos === p.position ? 1 : 0) >= MIN_BY_POS[pos];
          return leavesDepth;
        })
        .map(({ e, a: s }) => ({ e, s, sale: currentValue(s, e) }))
        .filter((x) => budget + x.sale >= cost)
        .sort((x, y) => {
          // preferir: misma posición (si buscamos puntos), suplentes, peor perspectiva
          const keep = (z: typeof x) =>
            (starterIds.has(z.s.player.id) ? 50 : 0) + z.s.xp * 4 + z.s.momentum * 0.3 - (z.s.player.position === p.position && intent !== "revalorizacion" ? 15 : 0);
          return keep(x) - keep(y);
        });
      const pick = candidates.find((c) => !starterIds.has(c.s.player.id) || (c.s.player.position === p.position && c.s.xp < a.xp));
      if (pick) {
        replaces = { playerId: pick.s.player.id, playerName: pick.s.player.name, saleValue: pick.sale };
        feasible = true;
        note = squadFull && budget >= cost ? "Plantilla completa: necesitas liberar una plaza." : `Requiere vender a ${pick.s.player.name}.`;
      } else {
        note = squadFull ? "Plantilla completa y ninguna venta razonable cubre la operación." : `Te faltan ${fmtMoney(cost - budget)} y ninguna venta razonable lo cubre.`;
      }
    }
    const income = replaces?.saleValue ?? 0;
    const after = budget + income - cost;

    const reasons: string[] = [];
    const benefits: string[] = [];
    const risks: string[] = [];
    if (intent !== "puntos") {
      reasons.push(`Tendencia de valor: ${trendText(a)}.`);
      const acc = accelText(a);
      if (acc) reasons.push(`Aceleración: ${acc}.`);
      if (a.trend.streakDays != null && a.trend.streakDays > 0) reasons.push(`Lleva ${a.trend.streakDays} días de racha alcista según la fuente.`);
      const est = Math.round(cost * ((a.trend.dailyRate ?? 0) / 100) * 3 * 0.6);
      if (est > 0) benefits.push(`Revalorización estimada en 3 días: ≈ ${fmtMoney(est)} (si la tendencia continúa; no garantizada).`);
    }
    if (intent !== "revalorizacion") {
      reasons.push(`${a.xp.toFixed(1)} pts esperados la próxima jornada (media ${a.basePoints.toFixed(1)} pts/partido, ${Math.round(a.pPlay * 100)}% de jugar).`);
      if (weakest?.playerId && !needSlots) benefits.push(`Mejora tu once: +${gain.toFixed(1)} pts esperados frente a ${nameOf(weakest.playerId)}.`);
      else benefits.push(`Cubre un hueco de ${POSITION_LABEL[p.position].toLowerCase()} en tu once (+${gain.toFixed(1)} pts esperados).`);
    }
    if (a.difficulty != null) reasons.push(`Próximo rival: dificultad ${a.difficulty}/5${a.home ? " (en casa)" : a.home === false ? " (fuera)" : ""}.`);
    if (p.status === "duda") risks.push("Figura como duda para la próxima jornada.");
    if (a.pPlaySource === "supuesto") risks.push("No hay dato fiable de titularidad.");
    else if (a.pPlay < 0.6) risks.push(`Solo ${Math.round(a.pPlay * 100)}% de probabilidad estimada de jugar.`);
    if (a.trend.accelLabel === "desacelera" && intent !== "puntos") risks.push("La subida está perdiendo fuerza: el margen de revalorización puede ser corto.");
    if (a.trend.basis === "sin-datos") risks.push("Sin histórico de precio: la tendencia no se puede evaluar.");
    if (!fromListings) risks.push("No has registrado tu mercado de hoy: comprueba que el jugador esté disponible (o haz una oferta a su mánager).");
    else risks.push("El mercado de LaLiga Fantasy funciona por pujas: otro mánager puede ofrecer más.");
    if (cost > (budget + income) * 0.6 && cost > 0) risks.push("Concentra una parte grande de tu liquidez en un solo jugador.");

    let lineupImpact: string;
    if (slotsFor(p.position) === 0) lineupImpact = "La formación recomendada no usa esta posición.";
    else if (gain >= 0.8) lineupImpact = weakest?.playerId && !needSlots ? `Entraría en tu once por ${nameOf(weakest.playerId)}.` : "Entraría directamente en tu once.";
    else lineupImpact = "Sería suplente con los datos actuales.";
    if (replaces && starterIds.has(replaces.playerId) && replaces.playerId !== weakest?.playerId) lineupImpact += ` Al vender a ${replaces.playerName} pierdes un titular.`;

    const base = intent === "revalorizacion" ? a.valueScore : intent === "puntos" ? Math.min(100, a.pointsScore * 0.6 + gain * 8) : (a.valueScore + a.pointsScore) / 2 + 5;
    let priority = 30 + base * 0.55 - (replaces ? 5 : 0) - (fromListings ? 0 : 8) - (a.confidence.level === "baja" ? 10 : 0);
    priority = Math.max(1, Math.min(90, priority));

    const conf = fromListings ? a.confidence.level : lowerConfidence(a.confidence.level);
    const rec: Recommendation = {
      id: `comprar-${p.id}`,
      action: feasible ? "COMPRAR" : "VIGILAR",
      priority: Math.round(feasible ? priority : priority * 0.6),
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      price: cost,
      intent,
      title: feasible
        ? `${replaces ? "Fichar" : "Comprar"} a ${p.name}${replaces ? ` vendiendo a ${replaces.playerName}` : ""}`
        : `Vigilar a ${p.name} (fuera de presupuesto)`,
      reasons,
      benefits,
      risks,
      budget: { before: budget, cost, income, after, feasible, note },
      lineupImpact,
      replaces,
      confidence: { level: conf, used: [...a.confidence.used, ...(fromListings ? ["tu mercado de hoy"] : [])], missing: [...a.confidence.missing, ...(fromListings ? [] : ["mercado del día"])] },
      inMyMarket: fromListings ? true : null,
    };
    if (input.bidContext) {
      rec.bid = computeBid(
        {
          value: a.trend.value ?? cost,
          floor: cost,
          dailyRate: a.trend.dailyRate,
          difficulties: a.upcoming.map((u) => u.difficulty),
          pointsGain2: pointsGain2(a, lineupRec, analyses),
          pPlay: a.pPlay,
          status: p.status,
          confidence: a.confidence.level,
        },
        input.bidContext,
        intent === "revalorizacion" ? "dinero" : "puntos",
      );
    }
    (feasible ? buyRecs : watchRecs).push(rec);
  }

  // Diversidad: máximo 3 compras por posición y 10 en total.
  const perPos: Record<string, number> = {};
  const chosenBuys = buyRecs
    .sort((x, y) => y.priority - x.priority)
    .filter((r) => {
      const k = r.position ?? "";
      perPos[k] = (perPos[k] ?? 0) + 1;
      return perPos[k] <= 3;
    })
    .slice(0, 10);
  // Si dos compras dependen de vender al mismo jugador, solo la mejor conserva la venta.
  const usedSale = new Set<string>();
  for (const r of chosenBuys) {
    if (!r.replaces) continue;
    if (usedSale.has(r.replaces.playerId)) r.risks.push(`Otra recomendación también usa la venta de ${r.replaces.playerName}: no son compatibles entre sí.`);
    usedSale.add(r.replaces.playerId);
  }
  recs.push(...chosenBuys, ...watchRecs.sort((x, y) => y.priority - x.priority).slice(0, 5));

  return recs.sort((x, y) => y.priority - x.priority);
}

/** Las decisiones más importantes del día (sin MANTENER). */
export function topDecisions(recs: Recommendation[], n = 3): Recommendation[] {
  return recs.filter((r) => r.action !== "MANTENER").slice(0, n);
}
