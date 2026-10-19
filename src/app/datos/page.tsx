import { getRepo } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";
import { ffEnabled, currentSeason } from "@/lib/services/sync";
import { footballDataEnabled } from "@/lib/providers/footballdata";
import { dbFile } from "@/lib/db/sqlite";
import { fmtDateTime, timeAgo } from "@/lib/domain/time";
import { Freshness, PageHeader, Section } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { SettingsForm, DemoReset } from "@/components/SettingsForm";

const SOURCES = [
  {
    name: "FútbolFantasy — mercado y puntos",
    status: "Integrada (HTML público)",
    provides: "Valor actual y de hace 1/2/3/7/14/30 mercados, tendencia, aceleración, próximo rival y % de titularidad; puntos LaLiga Fantasy (total, media, últimas 5).",
    limits: "No es una API documentada: se lee la página pública (robots.txt lo permite). 2 peticiones por sincronización, mínimo 60 min entre sincronizaciones. Si cambia el diseño de la web, el parser falla de forma controlada y se puede seguir con datos manuales. Uso personal; revisa sus condiciones antes de cualquier otro uso.",
  },
  {
    name: "FútbolFantasy — alineaciones probables",
    status: "Integrada (HTML público)",
    provides: "Once probable, alternativas, % de titularidad, lesionados y sancionados por partido.",
    limits: "1 página por partido (≈11 peticiones espaciadas 1,5 s). Son estimaciones de la web, no alineaciones oficiales; algunos partidos se publican tarde. Editables a mano.",
  },
  {
    name: "openfootball / football.json",
    status: "Integrada (sin clave)",
    provides: "Calendario completo, fechas, horarios (cuando se publican) y resultados.",
    limits: "Dominio público, mantenido por voluntarios: resultados y horarios pueden llegar con días de retraso. La clasificación calculada puede ir por detrás de la oficial.",
  },
  {
    name: "football-data.org",
    status: "Opcional (FOOTBALL_DATA_API_KEY)",
    provides: "Calendario y resultados oficiales de LaLiga (competición PD).",
    limits: "Requiere registro gratuito; 10 peticiones/min. Sin clave responde 403. Plan gratuito sin alineaciones ni estadísticas de jugador.",
  },
  {
    name: "API de LaLiga Fantasy (api-fantasy.llt-services.com)",
    status: "No integrada",
    provides: "Datos oficiales del juego (mercado de tu liga, pujas, puntos).",
    limits: "No es pública ni está documentada; exige iniciar sesión con tu cuenta y tokens de 24 h. Usarla automatizando tu login puede vulnerar los términos del juego. En las pruebas respondía 502. Por eso tu mercado diario se introduce a mano o por CSV.",
  },
];

export default async function DatosPage() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  return (
    <>
      <PageHeader
        eyebrow="Configuración"
        title="Datos y fuentes"
        subtitle="De dónde sale cada dato, cuándo se actualizó y qué límites tiene. Si una integración falla, todo se puede introducir a mano."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section eyebrow={workspace === "demo" ? "Modo demostración" : `Temporada ${currentSeason()}`} title="Sincronización">
            {workspace === "demo" ? (
              <p className="text-sm text-muted">Estás viendo datos ficticios. Cambia a «Mis datos» en la barra lateral para sincronizar fuentes reales.</p>
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
                  <span className="text-[11.5px] text-dim">
                    FútbolFantasy: {ffEnabled() ? "activado" : "desactivado"} · football-data.org: {footballDataEnabled() ? "clave configurada" : "sin clave (se usa openfootball)"}
                  </span>
                </div>
                <p className="mt-3 text-[12px] text-dim">
                  Automatízalo una vez al día con <code className="text-cyan">npm run sync</code> (Programador de tareas / cron) o llamando a <code className="text-cyan">/api/cron/daily</code>. Cada sincronización guarda una instantánea diaria de precios: con el tiempo, las tendencias se calculan con tu propio histórico.
                </p>
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

          <Section eyebrow="Investigación de fuentes" title="Qué ofrece cada fuente y sus límites">
            <div className="space-y-3">
              {SOURCES.map((src) => (
                <div key={src.name} className="panel-inset p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{src.name}</span>
                    <span className={`text-[11.5px] ${src.status.startsWith("Integrada") ? "text-up" : src.status.startsWith("Opcional") ? "text-cyan" : "text-down"}`}>{src.status}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-fg/85">{src.provides}</p>
                  <p className="mt-1 text-[12px] text-muted">{src.limits}</p>
                </div>
              ))}
              <p className="text-[11.5px] text-dim">Detalle completo en <code>docs/FUENTES.md</code>.</p>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section eyebrow="Tu cuenta" title="Ajustes">
            <SettingsForm teamName={s.settings.teamName} maxSquadSize={s.settings.maxSquadSize} />
          </Section>
          <Section eyebrow="Persistencia" title="Tus datos">
            <ul className="space-y-1.5 text-[12.5px] text-muted">
              <li>Base de datos: <code className="break-all text-fg/80">{dbFile(workspace)}</code></li>
              <li>{s.dataFreshness.playerCount} jugadores · {s.dataFreshness.snapshotDays} días de precios guardados · {s.transactions.length} operaciones</li>
              <li>Los datos reales y los de demostración están en archivos separados.</li>
            </ul>
            <a href="/api/export" className="btn-ghost mt-3 w-full">Descargar copia de seguridad (JSON)</a>
          </Section>
          {workspace === "demo" && (
            <Section eyebrow="Demo" title="Datos de demostración">
              <p className="mb-3 text-[12.5px] text-muted">Jugadores con nombres inventados en equipos reales, precios y resultados simulados. Sirven solo para probar el sistema.</p>
              <DemoReset />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
