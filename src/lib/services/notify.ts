import webpush from "web-push";
import type { Store, PushSubscriptionRow } from "../db/common";
import { computeAlerts, type PushMessage } from "../analytics/alerts";
import { formationSlots } from "../domain/formations";
import { buildState } from "./state";
import { syncIssues } from "./health";

export function pushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://fantasyos.netlify.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Envía un aviso a todos los dispositivos dados; borra las suscripciones caducadas. Devuelve cuántos llegaron. */
export async function sendPush(store: Store, subs: PushSubscriptionRow[], msg: PushMessage): Promise<number> {
  if (!pushEnabled() || subs.length === 0) return 0;
  configure();
  const payload = JSON.stringify(msg);
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 });
        ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await store.deletePushSubscription(s.endpoint);
        else console.error("[push]", code, e instanceof Error ? e.message : e);
      }
    }),
  );
  return ok;
}

/** Calcula y envía los avisos pendientes de un usuario (datos reales). */
export async function notifyUser(store: Store, subs: PushSubscriptionRow[], now = Date.now()): Promise<number> {
  const [s, issues, state] = await Promise.all([buildState(store, "real"), syncIssues(store), store.getNotifyState()]);
  const slots = formationSlots(s.settings.formation, s.settings.useCoach);
  const { messages, updates } = computeAlerts(
    {
      squad: s.squad.map((r) => ({
        id: r.entry.playerId,
        name: r.analysis.player.name,
        status: r.analysis.player.status,
        statusNote: r.analysis.player.statusNote,
        warned: Boolean(r.analysis.player.warned),
        inLineup: r.inLineup,
      })),
      next: s.calendar.next ? { matchday: s.calendar.next.matchday, firstKickoff: s.calendar.next.firstKickoff } : null,
      emptySlots: s.squad.length ? slots.filter((sl) => !s.settings.lineup[sl.slot]).length : 0,
      syncErrors: issues.filter((i) => i.type === "error").map((i) => ({ kind: i.kind, label: i.label, at: i.at })),
    },
    state,
    now,
  );
  // Si hay muchos a la vez, se agrupan para no saturar el móvil.
  const toSend =
    messages.length > 4
      ? [...messages.slice(0, 3), { title: `Y ${messages.length - 3} avisos más`, body: messages.slice(3).map((m) => m.title).join(" · "), url: "/", tag: "resumen" }]
      : messages;
  let sent = 0;
  for (const m of toSend) sent += await sendPush(store, subs, m);
  await store.setNotifyState(updates);
  return sent;
}

/** Paso programado: avisos de todos los usuarios con algún dispositivo suscrito. */
export async function notifyAll(shared: Store, storeFor: (userId: string) => Promise<Store>): Promise<{ users: number; sent: number }> {
  if (!pushEnabled()) return { users: 0, sent: 0 };
  const subs = await shared.listPushSubscriptions(true);
  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  let sent = 0;
  for (const [userId, list] of byUser) sent += await notifyUser(await storeFor(userId), list);
  return { users: byUser.size, sent };
}
