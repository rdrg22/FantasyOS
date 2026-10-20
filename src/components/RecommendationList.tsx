"use client";

import { useState } from "react";
import type { Recommendation } from "@/lib/analytics/recommendations";
import { RecommendationCard } from "./RecommendationCard";
import { Empty } from "./ui";
import type { UpcomingView } from "./NextFixtures";

const FILTERS = [
  ["todas", "Todas"],
  ["COMPRAR", "Comprar"],
  ["VENDER", "Vender"],
  ["MANTENER", "Mantener"],
  ["VIGILAR", "Vigilar"],
  ["ALINEAR", "Alineación"],
] as const;

export function RecommendationList({ recs, teams, ownIds, upcoming = {} }: { recs: Recommendation[]; teams: Record<string, string | null>; ownIds: string[]; upcoming?: Record<string, UpcomingView[]> }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("todas");
  const [intent, setIntent] = useState<"" | "revalorizacion" | "puntos" | "mixta">("");
  const own = new Set(ownIds);
  const list = recs.filter(
    (r) => (filter === "todas" ? true : filter === "ALINEAR" ? r.action === "ALINEAR" || r.action === "SALDO" : r.action === filter) && (!intent || r.intent === intent),
  );
  const count = (k: string) => (k === "todas" ? recs.length : recs.filter((r) => (k === "ALINEAR" ? r.action === "ALINEAR" || r.action === "SALDO" : r.action === k)).length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-[12.5px] transition ${filter === k ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-line text-muted hover:text-fg"}`}
          >
            {label} <span className="ml-1 text-dim">{count(k)}</span>
          </button>
        ))}
        <select className="input ml-auto !w-auto" value={intent} onChange={(e) => setIntent(e.target.value as typeof intent)} aria-label="Objetivo de la compra">
          <option value="">Objetivo: cualquiera</option>
          <option value="revalorizacion">Para revalorizar</option>
          <option value="puntos">Para puntuar</option>
          <option value="mixta">Valor + puntos</option>
        </select>
      </div>
      {list.length === 0 ? (
        <Empty title="Sin recomendaciones en esta categoría">Con los datos actuales no hay movimientos de este tipo. Sincroniza datos o registra tu mercado del día.</Empty>
      ) : (
        <div className="space-y-2.5">
          {list.map((r, i) => (
            <RecommendationCard key={r.id} rec={r} rank={i + 1} teamId={r.playerId ? teams[r.playerId] ?? null : undefined} ownsPlayer={!!r.playerId && own.has(r.playerId)} upcoming={r.playerId ? upcoming[r.playerId] : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
