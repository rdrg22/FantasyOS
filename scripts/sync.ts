/**
 * Sincronización desde la línea de comandos (sin necesidad de tener la web abierta).
 *   npm run sync              -> calendario + mercado + puntos + alineaciones (respeta el intervalo mínimo)
 *   npm run sync -- market    -> solo un paso: fixtures | market | points | lineups
 *   npm run sync -- all --force
 * Usa Supabase si están definidas sus variables (.env.local); si no, la base de datos SQLite local.
 */
import { syncAll, syncStep, SYNC_STEPS, type SyncKind } from "../src/lib/services/sync";
import { buildState } from "../src/lib/services/state";
import type { Store } from "../src/lib/db/common";
import { supabaseEnabled } from "../src/lib/supabase/config";

async function open(userId: string): Promise<Store> {
  if (supabaseEnabled()) {
    const { createClient } = await import("@supabase/supabase-js");
    const { SupabaseStore } = await import("../src/lib/db/supabase-store");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, { auth: { persistSession: false } });
    return new SupabaseStore(sb, userId, "real");
  }
  const { openSqliteStore } = await import("../src/lib/db/sqlite-store");
  return openSqliteStore("real", userId);
}

async function main() {
  const args = process.argv.slice(2);
  const kind = args.find((a) => !a.startsWith("--")) ?? "all";
  const force = args.includes("--force");
  const shared = await open("cron");
  if (kind !== "all" && !SYNC_STEPS.includes(kind as SyncKind)) {
    console.error(`Paso desconocido: ${kind}. Usa all | ${SYNC_STEPS.join(" | ")}`);
    process.exit(2);
  }
  const results = kind === "all" ? await syncAll(shared, force) : [await syncStep(shared, kind as SyncKind, { force })];
  for (const r of results) console.log(`[${r.status.toUpperCase()}] ${r.kind}: ${r.message}`);
  // Registra el valor diario de la plantilla de cada usuario
  for (const u of await shared.listUserIds()) await buildState(await open(u), "real");
  console.log(`[${supabaseEnabled() ? "supabase" : "sqlite"}] listo`);
  process.exit(results.some((r) => r.status === "error") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
