import { getRepo } from "@/lib/services/context";
import { buildState, toView } from "@/lib/services/state";
import { Freshness, PageHeader } from "@/components/ui";
import { SyncButton } from "@/components/SyncButton";
import { MarketView } from "@/components/market/MarketView";

export default async function MercadoPage() {
  const { repo, workspace } = await getRepo();
  const s = buildState(repo, workspace);
  const players = [...s.analyses.values()].map(toView);
  const squadIds = s.squad.map((r) => r.entry.playerId);
  return (
    <>
      <PageHeader
        eyebrow="Mercado"
        title="Precios y oportunidades"
        subtitle={
          <>
            Valores de LaLiga Fantasy, variaciones, rendimiento y probabilidad de jugar. La <b>puntuación de oportunidad</b> combina impulso de precio y puntos esperados (0–100); es orientativa.
          </>
        }
        actions={
          <>
            <Freshness label="Precios" at={s.dataFreshness.marketUpdatedAt} />
            {workspace === "real" && <SyncButton kind="market" label="Actualizar precios" />}
          </>
        }
      />
      <MarketView
        players={players}
        squadIds={squadIds}
        listings={s.listings}
        listingsDate={s.listingsDate}
        today={s.today}
        budget={s.settings.budget}
        snapshotDays={s.dataFreshness.snapshotDays}
      />
    </>
  );
}
