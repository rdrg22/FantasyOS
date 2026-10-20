"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAction } from "./useAction";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Support = "cargando" | "ok" | "no-soportado" | "ios-instalar" | "sin-claves";

/** Activa o desactiva los avisos push en este dispositivo. */
export function PushToggle() {
  const [support, setSupport] = useState<Support>("cargando");
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [denied, setDenied] = useState(false);
  const [working, setWorking] = useState(false);
  const { run, busy } = useAction();

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!KEY) return setSupport("sin-claves");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSupport(ios && !standalone ? "ios-instalar" : "no-soportado");
    setDenied(Notification.permission === "denied");
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => {
        setSub(s);
        setSupport("ok");
      })
      .catch(() => setSupport("no-soportado"));
  }, []);

  async function enable() {
    setWorking(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setDenied(perm === "denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const json = s.toJSON();
      const r = await run({ type: "pushSubscribe", endpoint: s.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
      if (r.ok) setSub(s);
    } finally {
      setWorking(false);
    }
  }

  async function disable() {
    if (!sub) return;
    setWorking(true);
    try {
      await run({ type: "pushUnsubscribe", endpoint: sub.endpoint });
      await sub.unsubscribe();
      setSub(null);
    } finally {
      setWorking(false);
    }
  }

  if (support === "cargando") return <p className="text-sm text-muted">Comprobando este dispositivo…</p>;
  if (support === "sin-claves") return <p className="text-sm text-muted">Los avisos no están configurados en el servidor (faltan las claves VAPID).</p>;
  if (support === "ios-instalar")
    return (
      <p className="text-sm text-muted">
        En iPhone los avisos solo funcionan con la app instalada: en Safari pulsa <b>Compartir → Añadir a pantalla de inicio</b>, ábrela desde el icono y vuelve aquí.
      </p>
    );
  if (support === "no-soportado") return <p className="text-sm text-muted">Este navegador no admite avisos push.</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-[13px] text-muted">
        <li>🚑 Un jugador tuyo se lesiona, es duda, está sancionado o vuelve a estar disponible.</li>
        <li>🟨 Un jugador tuyo queda apercibido.</li>
        <li>⚽ La jornada empieza en menos de un día (y otro aviso 4 h antes si tu once tiene huecos o bajas).</li>
        <li>⚠️ No se han podido actualizar los datos.</li>
      </ul>
      {denied && <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[12.5px] text-gold">Has bloqueado los avisos para esta web. Permítelos en los ajustes del navegador o del móvil y vuelve a intentarlo.</p>}
      <div className="flex flex-wrap gap-2">
        {sub ? (
          <>
            <button className="btn-ghost" disabled={busy || working} onClick={() => run({ type: "pushTest" })}>
              <Bell size={14} /> Enviar aviso de prueba
            </button>
            <button className="btn-ghost text-down" disabled={busy || working} onClick={disable}>
              <BellOff size={14} /> Desactivar en este dispositivo
            </button>
          </>
        ) : (
          <button className="btn-primary" disabled={busy || working || denied} onClick={enable}>
            <Bell size={14} /> {working ? "Activando…" : "Activar avisos en este dispositivo"}
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-dim">Se comprueban varias veces al día, después de cada actualización de datos. Solo usan tus datos reales, no la demo.</p>
    </div>
  );
}
