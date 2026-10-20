import Link from "next/link";
import { getRepo } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";
import { fmtDate } from "@/lib/domain/time";
import { PageHeader } from "@/components/ui";
import { RecommendationList } from "@/components/RecommendationList";

export default async function RecomendacionesPage() {
  const { repo, workspace } = await getRepo();
  const s = await buildState(repo, workspace);
  const teams: Record<string, string | null> = {};
  const upcoming: Record<string, NonNullable<ReturnType<typeof s.analyses.get>>["upcoming"]> = {};
  for (const r of s.recommendations) {
    if (!r.playerId) continue;
    const a = s.analyses.get(r.playerId);
    teams[r.playerId] = a?.player.teamId ?? null;
    if (a) upcoming[r.playerId] = a.upcoming;
  }
  return (
    <>
      <PageHeader
        eyebrow="Motor de recomendaciones"
        title="Comprar, vender, mantener, vigilar"
        subtitle={
          <>
            Basado en tu plantilla ({s.squad.length} jugadores), tu saldo y{" "}
            {s.listings.length ? <>tu mercado del {fmtDate(s.listingsDate)} ({s.listings.length} jugadores)</> : <>el catálogo completo (no has registrado tu mercado)</>}. Ninguna compra supera tu presupuesto. Cómo se calcula:{" "}
            <Link href="/ayuda" className="text-cyan underline">Ayuda</Link>.
          </>
        }
      />
      <RecommendationList recs={s.recommendations} teams={teams} ownIds={s.squad.map((r) => r.entry.playerId)} upcoming={upcoming} />
    </>
  );
}
