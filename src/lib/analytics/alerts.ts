import type { PlayerStatus } from "../domain/types";
import { fmtDateTime } from "../domain/time";

export interface AlertPlayer {
  id: string;
  name: string;
  status: PlayerStatus;
  statusNote: string | null;
  warned: boolean;
  inLineup: boolean;
}

export interface AlertInput {
  squad: AlertPlayer[];
  next: { matchday: number; firstKickoff: string | null } | null;
  /** Huecos vacíos en tu once guardado */
  emptySlots: number;
  syncErrors: { kind: string; label: string; at: string | null }[];
}

export interface PushMessage {
  title: string;
  body: string;
  /** Página que se abre al tocar el aviso */
  url: string;
  /** Avisos con la misma etiqueta se sustituyen en el móvil en lugar de acumularse */
  tag: string;
}

const BAD: PlayerStatus[] = ["lesionado", "sancionado", "duda"];
const H = 3_600_000;

/**
 * Decide qué avisar comparando con el último estado avisado (`state`), para no repetir:
 * cambios de estado de tus jugadores, nuevos apercibidos, inicio de jornada y fallos de sincronización.
 */
export function computeAlerts(input: AlertInput, state: Map<string, string>, now = Date.now()): { messages: PushMessage[]; updates: [string, string][] } {
  const messages: PushMessage[] = [];
  const updates: [string, string][] = [];

  for (const p of input.squad) {
    // Estado físico / disciplinario
    if (p.status !== "desconocido") {
      const key = `status:${p.id}`;
      const prev = state.get(key) ?? "disponible";
      if (p.status !== prev) {
        updates.push([key, p.status]);
        const where = p.inLineup ? " Está en tu once." : "";
        if (p.status === "lesionado") messages.push({ title: `🚑 ${p.name} está lesionado`, body: (p.statusNote ?? "Revisa tu alineación.") + where, url: "/alineacion", tag: key });
        else if (p.status === "sancionado") messages.push({ title: `🟥 ${p.name} está sancionado`, body: (p.statusNote ?? "No jugará la próxima jornada.") + where, url: "/alineacion", tag: key });
        else if (p.status === "duda") messages.push({ title: `❓ ${p.name} es duda`, body: (p.statusNote ?? "Puede que no juegue.") + where, url: "/alineacion", tag: key });
        else if (BAD.includes(prev as PlayerStatus)) messages.push({ title: `✅ ${p.name} vuelve a estar disponible`, body: "Ya puedes contar con él para tu once.", url: "/alineacion", tag: key });
      }
    }
    // Apercibidos
    const wkey = `warned:${p.id}`;
    const wprev = state.get(wkey) === "1";
    if (p.warned !== wprev) {
      updates.push([wkey, p.warned ? "1" : "0"]);
      if (p.warned) messages.push({ title: `🟨 ${p.name} está apercibido`, body: "Una amarilla más y se pierde el siguiente partido.", url: "/liga", tag: wkey });
    }
  }

  // Inicio de jornada
  const n = input.next;
  if (n?.firstKickoff) {
    const left = Date.parse(n.firstKickoff) - now;
    const lineupBad = input.squad.filter((p) => p.inLineup && (p.status === "lesionado" || p.status === "sancionado")).length;
    const problems = [
      input.emptySlots ? `${input.emptySlots} ${input.emptySlots === 1 ? "hueco vacío" : "huecos vacíos"}` : null,
      lineupBad ? `${lineupBad} ${lineupBad === 1 ? "jugador que no jugará" : "jugadores que no jugarán"}` : null,
    ].filter(Boolean);
    const key = `md:${n.matchday}`;
    if (left > 0 && left <= 26 * H && !state.get(key)) {
      updates.push([key, "24h"]);
      messages.push({
        title: `⚽ La jornada ${n.matchday} empieza ${fmtDateTime(n.firstKickoff)}`,
        body: problems.length ? `Tu once tiene ${problems.join(" y ")}. Revísalo antes del cierre.` : "Tu once está completo. Echa un vistazo a las últimas alineaciones.",
        url: "/alineacion",
        tag: key,
      });
    } else if (left > 0 && left <= 4 * H && problems.length && state.get(key) !== "4h") {
      updates.push([key, "4h"]);
      messages.push({ title: `⏰ Quedan menos de 4 h para la jornada ${n.matchday}`, body: `Tu once tiene ${problems.join(" y ")}.`, url: "/alineacion", tag: key });
    }
  }

  // Fallos de sincronización (uno por fallo nuevo)
  for (const e of input.syncErrors) {
    const key = `sync:${e.kind}`;
    if (e.at && state.get(key) !== e.at) {
      updates.push([key, e.at]);
      messages.push({ title: "⚠️ No se han podido actualizar los datos", body: `${e.label}: revisa «Datos y fuentes». Las recomendaciones pueden usar datos viejos.`, url: "/datos", tag: "sync" });
    }
  }

  return { messages, updates };
}
