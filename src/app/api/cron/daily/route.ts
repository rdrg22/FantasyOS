import { NextResponse } from "next/server";
import { repoFor } from "@/lib/services/context";
import { syncAll } from "@/lib/services/sync";
import { buildState } from "@/lib/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sincronización diaria de los datos REALES (calendario, mercado+puntos, alineaciones) y
 * registro del valor de la plantilla. Pensado para un programador externo (cron, Task Scheduler):
 *   GET /api/cron/daily            (si FOS_CRON_SECRET no está definido, solo desde localhost)
 *   GET /api/cron/daily?secret=XXX
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.FOS_CRON_SECRET;
  const host = req.headers.get("host") ?? "";
  if (secret ? url.searchParams.get("secret") !== secret : !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  const repo = repoFor("real");
  const results = await syncAll(repo, url.searchParams.get("force") === "1");
  buildState(repo, "real");
  return NextResponse.json({ ok: results.every((r) => r.status !== "error"), results });
}
