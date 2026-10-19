import { NextResponse } from "next/server";
import { storeFor } from "@/lib/services/context";
import { syncStep, SYNC_STEPS, type SyncKind } from "@/lib/services/sync";
import { buildState } from "@/lib/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sincronización de los datos REALES, por pasos (cada llamada cabe en ~10 s):
 *   GET /api/cron/daily?step=fixtures|market|points|lineups|snapshot[&exclude=a-b,c-d][&force=1]
 * Sin `step` ejecuta todos los pasos seguidos (solo recomendable en local).
 * Autorización: cabecera `Authorization: Bearer <FOS_CRON_SECRET>` o `?secret=`; sin secreto
 * configurado solo se acepta desde localhost.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.FOS_CRON_SECRET;
  const host = req.headers.get("host") ?? "";
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
  if (secret ? given !== secret : !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const force = url.searchParams.get("force") === "1";
  const step = url.searchParams.get("step");
  const exclude = (url.searchParams.get("exclude") ?? "").split(",").filter(Boolean);
  // Los datos compartidos (jugadores, calendario...) no dependen del usuario.
  const shared = await storeFor("real", "cron");

  if (step === "snapshot") {
    // Guarda el valor diario de la plantilla de cada usuario.
    const users = await shared.listUserIds();
    for (const u of users) await buildState(await storeFor("real", u), "real");
    return NextResponse.json({ ok: true, step, users: users.length });
  }
  if (step) {
    if (!SYNC_STEPS.includes(step as SyncKind)) return NextResponse.json({ ok: false, error: "Paso no válido." }, { status: 400 });
    const r = await syncStep(shared, step as SyncKind, { force, exclude });
    return NextResponse.json({ ok: r.status !== "error", result: r });
  }
  const results = [];
  for (const s of SYNC_STEPS) results.push(await syncStep(shared, s, { force }));
  return NextResponse.json({ ok: results.every((r) => r.status !== "error"), results });
}
