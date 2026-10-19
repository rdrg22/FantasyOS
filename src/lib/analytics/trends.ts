import type { Player, PriceSnapshot } from "../domain/types";
import { pctChange } from "../domain/money";
import { daysBetween } from "../domain/time";

export type TrendBasis = "fuente" | "instantaneas" | "mixta" | "sin-datos";
export type Direction = "sube" | "baja" | "estable";
export type AccelLabel = "acelera" | "desacelera" | "estable" | "inflexion-positiva" | "inflexion-negativa" | null;

export interface SeriesPoint {
  label: string;
  value: number;
  kind: "fuente" | "instantanea";
  date?: string;
}

export interface Trend {
  value: number | null;
  prev: number | null; // valor del mercado anterior
  change1: number | null;
  pct1: number | null;
  change3: number | null;
  pct3: number | null;
  pct7: number | null;
  pct14: number | null;
  pct30: number | null;
  /** Variación diaria ponderada (%/día) */
  dailyRate: number | null;
  /** Variación de hoy menos media diaria de los 3 días anteriores, en puntos porcentuales */
  accel: number | null;
  accelLabel: AccelLabel;
  direction: Direction;
  streakDays: number | null;
  basis: TrendBasis;
  daysOfData: number;
  series: SeriesPoint[];
}

/**
 * Valor N mercados atrás. Prioriza instantáneas propias (fechas reales) y, si no
 * existen, usa el histórico publicado por la fuente. Nunca extrapola.
 */
function valueAgo(n: number, player: Player, snaps: PriceSnapshot[], today: string): { v: number | null; from: "fuente" | "instantanea" | null } {
  const target = snaps.find((s) => daysBetween(s.date, today) === n);
  if (target) return { v: target.value, from: "instantanea" };
  const h = player.sourceHistory;
  const key = (`d${n}` as keyof NonNullable<typeof h>);
  if (h && key in h && h[key] != null) return { v: h[key]!, from: "fuente" };
  return { v: null, from: null };
}

export function computeTrend(player: Player, snapshots: PriceSnapshot[] | undefined, today: string): Trend {
  const snaps = (snapshots ?? []).filter((s) => s.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const todaySnap = snaps.find((s) => s.date === today);
  const value = player.value ?? todaySnap?.value ?? snaps.at(-1)?.value ?? null;

  const used = new Set<string>();
  const ago = (n: number) => {
    const r = valueAgo(n, player, snaps, today);
    if (r.from) used.add(r.from);
    return r.v;
  };
  const v1 = ago(1);
  const v2 = ago(2);
  const v3 = ago(3);
  const v4 = ago(4);
  const v7 = ago(7);
  const v14 = ago(14);
  const v30 = ago(30);

  const pct1 = pctChange(value, v1);
  const pct3 = pctChange(value, v3);
  const pct7 = pctChange(value, v7);

  // Tasa diaria ponderada: lo reciente pesa más.
  const parts: [number, number][] = [];
  if (pct1 != null) parts.push([pct1, 0.5]);
  if (pct3 != null) parts.push([pct3 / 3, 0.3]);
  if (pct7 != null) parts.push([pct7 / 7, 0.2]);
  const wsum = parts.reduce((a, [, w]) => a + w, 0);
  const dailyRate = wsum > 0 ? parts.reduce((a, [p, w]) => a + p * w, 0) / wsum : null;

  // Aceleración: variación de hoy frente a la media diaria de los días 2-4.
  let accel: number | null = null;
  const prevDaily = [pctChange(v1, v2), pctChange(v2, v3), pctChange(v3, v4)].filter((x): x is number => x != null);
  if (pct1 != null && prevDaily.length > 0) {
    accel = pct1 - prevDaily.reduce((a, b) => a + b, 0) / prevDaily.length;
  }
  let accelLabel: AccelLabel = null;
  if (accel != null && pct1 != null && prevDaily.length > 0) {
    const prevAvg = prevDaily.reduce((a, b) => a + b, 0) / prevDaily.length;
    if (prevAvg < -0.05 && pct1 > 0.05) accelLabel = "inflexion-positiva";
    else if (prevAvg > 0.05 && pct1 < -0.05) accelLabel = "inflexion-negativa";
    else if (Math.abs(accel) < 0.15) accelLabel = "estable";
    else if ((pct1 >= 0 && accel > 0) || (pct1 < 0 && accel < 0)) accelLabel = "acelera";
    else accelLabel = "desacelera";
  }

  const rate = dailyRate ?? 0;
  const direction: Direction = dailyRate == null ? "estable" : rate > 0.25 ? "sube" : rate < -0.25 ? "baja" : "estable";

  // Serie para gráficos: instantáneas reales si hay al menos 3; si no, puntos de la fuente.
  const series: SeriesPoint[] = [];
  if (snaps.length >= 3) {
    for (const s of snaps.slice(-45)) series.push({ label: s.date.slice(5), value: s.value, kind: "instantanea", date: s.date });
    if (value != null && !todaySnap) series.push({ label: "hoy", value, kind: "instantanea", date: today });
  } else if (player.sourceHistory) {
    const h = player.sourceHistory;
    const pts: [string, number | null][] = [["-30", h.d30], ["-14", h.d14], ["-7", h.d7], ["-3", h.d3], ["-2", h.d2], ["-1", h.d1]];
    for (const [l, v] of pts) if (v != null) series.push({ label: `${l} merc.`, value: v, kind: "fuente" });
    if (value != null) series.push({ label: "hoy", value, kind: "fuente" });
  }

  const basis: TrendBasis = used.size === 0 ? "sin-datos" : used.size === 2 ? "mixta" : used.has("fuente") ? "fuente" : "instantaneas";
  const knownDays = [v1, v2, v3, v7, v14, v30].filter((x) => x != null).length;

  return {
    value,
    prev: v1,
    change1: value != null && v1 != null ? value - v1 : null,
    pct1,
    change3: value != null && v3 != null ? value - v3 : null,
    pct3,
    pct7,
    pct14: pctChange(value, v14),
    pct30: pctChange(value, v30),
    dailyRate,
    accel,
    accelLabel,
    direction,
    streakDays: player.sourceStreakDays,
    basis,
    daysOfData: Math.max(snaps.length, knownDays),
    series,
  };
}

/** Puntuación de impulso de valor, -100..100. */
export function momentumScore(t: Trend): number {
  if (t.dailyRate == null) return 0;
  let s = t.dailyRate * 30;
  if (t.accelLabel === "acelera") s += t.dailyRate > 0 ? 8 : -8;
  if (t.accelLabel === "desacelera") s += t.dailyRate > 0 ? -8 : 6;
  if (t.accelLabel === "inflexion-positiva") s += 6;
  if (t.accelLabel === "inflexion-negativa") s -= 10;
  return Math.max(-100, Math.min(100, s));
}
