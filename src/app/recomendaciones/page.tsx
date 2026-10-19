import { getRepo } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";
import { fmtDate } from "@/lib/domain/time";
import { PageHeader, Section } from "@/components/ui";
import { RecommendationList } from "@/components/RecommendationList";

export default async function RecomendacionesPage() {
  const { repo, workspace } = await getRepo();
  const s = buildState(repo, workspace);
  const teams: Record<string, string | null> = {};
  for (const r of s.recommendations) if (r.playerId) teams[r.playerId] = s.analyses.get(r.playerId)?.player.teamId ?? null;
  return (
    <>
      <PageHeader
        eyebrow="Motor de recomendaciones"
        title="Comprar, vender, mantener, vigilar"
        subtitle={
          <>
            Basado en tu plantilla ({s.squad.length} jugadores), tu saldo y{" "}
            {s.listings.length ? <>tu mercado del {fmtDate(s.listingsDate)} ({s.listings.length} jugadores)</> : <>el catálogo completo (no has registrado tu mercado)</>}. Cada compra comprueba que no superas el presupuesto, combinándola con una venta si hace falta.
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecommendationList recs={s.recommendations} teams={teams} ownIds={s.squad.map((r) => r.entry.playerId)} />
        <div className="space-y-4">
          <Section eyebrow="Cómo se calcula" title="Metodología">
            <ul className="space-y-2 text-[12.5px] text-muted">
              <li><b className="text-fg">Tendencia de valor:</b> variación del último mercado, 3 y 7 días, ponderando lo reciente; detecta aceleración, frenada y cambios de tendencia.</li>
              <li><b className="text-fg">Puntos esperados:</b> media de puntos (temporada y últimas 5) × probabilidad de jugar × factor de rival (fuerza del rival según clasificación y localía, ±20%).</li>
              <li><b className="text-fg">Probabilidad de jugar:</b> alineación probable si existe; si no, % publicado por la fuente; si no, partidos recientes. Lesionados y sancionados cuentan como 0.</li>
              <li><b className="text-fg">Compras:</b> «para revalorizar» si el precio sube con fuerza y juega; «para puntuar» si mejora a tu titular más flojo de esa posición en ≥ 0,8 puntos esperados.</li>
              <li><b className="text-fg">Viabilidad:</b> si no te llega el saldo o tienes la plantilla llena, se busca la venta menos dolorosa (suplentes con peor perspectiva) sin dejarte sin jugadores para alinear.</li>
              <li><b className="text-fg">Confianza:</b> depende de cuántos datos reales hay detrás (histórico, puntos, titularidad, rival, mercado del día).</li>
            </ul>
          </Section>
          <Section eyebrow="Importante" title="Límites">
            <p className="text-[12.5px] text-muted">
              Ningún modelo conoce el precio de mañana ni la alineación oficial. Las recomendaciones son señales para decidir tú, no órdenes. En LaLiga Fantasy los fichajes del mercado son por puja: otro mánager puede ofrecer más.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
