/**
 * Sincronización desde la línea de comandos (sin necesidad de tener la web abierta).
 *   npm run sync              -> calendario + mercado/puntos + alineaciones (respeta el intervalo mínimo)
 *   npm run sync -- market    -> solo una fuente: market | fixtures | lineups
 *   npm run sync -- all --force
 * Pensado para programarlo una vez al día (Programador de tareas de Windows, cron...).
 */
import { openDb } from "../src/lib/db/sqlite";
import { Repo } from "../src/lib/db/repo";
import { syncAll, syncFixtures, syncLineups, syncMarket } from "../src/lib/services/sync";
import { buildState } from "../src/lib/services/state";

async function main() {
  const args = process.argv.slice(2);
  const kind = args.find((a) => !a.startsWith("--")) ?? "all";
  const force = args.includes("--force");
  const repo = new Repo(openDb("real"), "local");
  const results =
    kind === "all" ? await syncAll(repo, force)
    : kind === "market" ? [await syncMarket(repo, force)]
    : kind === "fixtures" ? [await syncFixtures(repo, force)]
    : kind === "lineups" ? [await syncLineups(repo, force)]
    : null;
  if (!results) {
    console.error(`Tipo desconocido: ${kind}. Usa all | market | fixtures | lineups`);
    process.exit(2);
  }
  for (const r of results) console.log(`[${r.status.toUpperCase()}] ${r.kind}: ${r.message}`);
  buildState(repo, "real"); // registra el valor diario de la plantilla
  process.exit(results.some((r) => r.status === "error") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
