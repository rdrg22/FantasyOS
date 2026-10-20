import type { Store } from "../db/common";
import type { SyncLogEntry } from "../domain/types";
import { SYNC_SOURCE, SYNC_STEPS, type SyncKind } from "./sync";

export interface SyncIssue {
  kind: SyncKind;
  label: string;
  /** "error": el último intento falló; "antiguo": hace demasiado que no se actualiza */
  type: "error" | "antiguo";
  at: string | null;
  message: string | null;
}

const LABEL: Record<SyncKind, string> = {
  market: "Precios del mercado",
  points: "Puntos",
  fixtures: "Calendario",
  results: "Resultados",
  lineups: "Alineaciones probables",
};

/** Horas máximas sin una actualización correcta antes de avisar (las alineaciones solo importan cerca de la jornada). */
const MAX_AGE_H: Partial<Record<SyncKind, number>> = { market: 30, points: 30, fixtures: 96 };

/**
 * Problemas de sincronización a partir del último intento correcto y del último fallido de cada paso.
 * Un fallo cuenta solo si es posterior al último éxito.
 */
export function evaluateSyncHealth(
  last: Record<SyncKind, { ok: SyncLogEntry | null; error: SyncLogEntry | null }>,
  now = Date.now(),
): SyncIssue[] {
  const issues: SyncIssue[] = [];
  for (const kind of SYNC_STEPS) {
    const { ok, error } = last[kind];
    const okAt = ok ? Date.parse(ok.finishedAt ?? ok.startedAt) : 0;
    const errAt = error ? Date.parse(error.finishedAt ?? error.startedAt) : 0;
    if (error && errAt > okAt) {
      issues.push({ kind, label: LABEL[kind], type: "error", at: error.finishedAt ?? error.startedAt, message: error.message });
      continue;
    }
    const max = MAX_AGE_H[kind];
    if (max && ok && now - okAt > max * 3_600_000) {
      issues.push({ kind, label: LABEL[kind], type: "antiguo", at: ok.finishedAt ?? ok.startedAt, message: null });
    }
  }
  return issues;
}

export async function syncIssues(repo: Store): Promise<SyncIssue[]> {
  const entries = await Promise.all(
    SYNC_STEPS.map(async (k) => {
      const [ok, error] = await Promise.all([repo.lastSync(SYNC_SOURCE[k], k, "ok"), repo.lastSync(SYNC_SOURCE[k], k, "error")]);
      return [k, { ok, error }] as const;
    }),
  );
  return evaluateSyncHealth(Object.fromEntries(entries) as Record<SyncKind, { ok: SyncLogEntry | null; error: SyncLogEntry | null }>);
}
