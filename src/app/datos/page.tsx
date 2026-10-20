import Link from "next/link";
import { getRepo } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";
import { ffEnabled, currentSeason } from "@/lib/services/sync";
import { footballDataEnabled } from "@/lib/providers/footballdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { fmtDateTime, timeAgo } from "@/lib/domain/time";
import { Freshness, PageHeader, Section } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { SettingsForm, DemoReset } from "@/components/SettingsForm";

export default async function DatosPage() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  const storage = supabaseEnabled() ? "Supabase (Postgres)" : (await import("@/lib/db/sqlite")).dbFile(workspace);
  return (
    <>
      <PageHeader
        eyebrow="Configuración"
        title="Datos y fuentes"
        subtitle={
          <>
            Cuándo se actualizó cada dato. Si una integración falla, todo se puede introducir a mano. Qué ofrece y qué límites tiene cada fuente: <Link href="/ayuda" className="text-cyan underline">Ayuda</Link>.
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section
            eyebrow={workspace === "demo" ? "Modo demostración" : `Temporada ${currentSeason()}`}
            title="Sincronización"
            info={
              <>
                Cada sincronización guarda una foto diaria de los precios: con el tiempo, las tendencias se calculan con tu propio histórico. En la web publicada se ejecuta sola cada día.
                <br />
                FútbolFantasy: {ffEnabled() ? "activado" : "desactivado"} · football-data.org: {footballDataEnabled() ? "con clave" : "sin clave (se usa openfootball)"}.
              </>
            }
          >
            {workspace === "demo" ? (
              <p className="text-sm text-muted">Estás viendo datos ficticios. Cambia a «Mis datos» para sincronizar.</p>
            ) : (
              <>
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  <div className="panel-inset space-y-2 p-3">
                    <div className="text-sm font-medium">Precios y puntos</div>
                    <Freshness label="Última" at={s.dataFreshness.marketUpdatedAt} />
                    <SyncButton kind={["market", "points"]} label="Sincronizar" ghost />
                  </div>
                  <div className="panel-inset space-y-2 p-3">
                    <div className="text-sm font-medium">Calendario</div>
                    <Freshness label="Última" at={s.dataFreshness.fixturesUpdatedAt} staleHours={72} />
                    <SyncButton kind="fixtures" label="Sincronizar" ghost />
                  </div>
                  <div className="panel-inset space-y-2 p-3">
                    <div className="text-sm font-medium">Alineaciones</div>
                    <Freshness label="Última" at={s.dataFreshness.lineupsUpdatedAt} staleHours={12} />
                    <SyncButton kind="lineups" label="Sincronizar" ghost />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SyncButton kind="all" label="Sincronizar todo" />
                  <SyncButton kind="all" label="Forzar (ignorar intervalo)" force ghost />
                </div>
              </>
            )}
          </Section>

          <Section eyebrow="Registro" title="Últimas sincronizaciones">
            {s.syncLog.length === 0 ? (
              <p className="text-sm text-muted">Todavía no se ha sincronizado nada.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="table-compact w-full min-w-[620px]">
                  <thead><tr><th>Cuándo</th><th>Fuente</th><th>Estado</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {s.syncLog.map((l) => (
                      <tr key={l.id}>
                        <td className="num whitespace-nowrap text-muted" title={fmtDateTime(l.startedAt)}>{timeAgo(l.startedAt)}</td>
                        <td className="whitespace-nowrap">{l.source} · {l.kind}</td>
                        <td><span className={`font-mono text-[11px] uppercase ${l.status === "ok" ? "text-up" : l.status === "error" ? "text-down" : "text-gold"}`}>{l.status}</span></td>
                        <td className="text-[12.5px] text-muted">{l.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section eyebrow="Tu cuenta" title="Ajustes">
            <SettingsForm teamName={s.settings.teamName} maxSquadSize={s.settings.maxSquadSize} />
          </Section>
          <Section eyebrow="Persistencia" title="Tus datos" info="Los datos reales y los de demostración se guardan por separado y nunca se mezclan.">
            <ul className="space-y-1.5 text-[12.5px] text-muted">
              <li>Almacenamiento: <code className="break-all text-fg/80">{storage}</code></li>
              <li>{s.dataFreshness.playerCount} jugadores · {s.dataFreshness.snapshotDays} días de precios · {s.transactions.length} operaciones</li>
            </ul>
            <a href="/api/export" className="btn-ghost mt-3 w-full">Descargar copia de seguridad (JSON)</a>
          </Section>
          {workspace === "demo" && (
            <Section eyebrow="Demo" title="Datos de demostración" info="Jugadores con nombres inventados en equipos reales, con precios y resultados simulados. Solo sirven para probar.">
              <DemoReset />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
