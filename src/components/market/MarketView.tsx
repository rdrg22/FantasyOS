"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Plus, Check } from "lucide-react";
import type { PlayerView } from "@/lib/services/state";
import type { MarketListing, Position, PlayerStatus } from "@/lib/domain/types";
import { POSITIONS, STATUS_LABEL } from "@/lib/domain/types";
import { TEAMS, getTeam } from "@/lib/domain/teams";
import { normalizeName } from "@/lib/domain/normalize";
import { fmtCompact, fmtMoney, fmtSigned } from "@/lib/domain/money";
import { Delta, Difficulty, Empty, PosBadge, ProbBar, ScoreRing, StatusBadge, TeamChip } from "../ui";
import { Sparkline } from "../Sparkline";
import { PlayerDetail } from "./PlayerDetail";
import { DailyMarket } from "./DailyMarket";
import { useAction } from "../useAction";

type SortKey = "opportunity" | "value" | "change1" | "pct1" | "pct7" | "points" | "avg" | "pPlay" | "xp" | "name";

const ACCEL: Record<string, string> = {
  acelera: "acelera",
  desacelera: "frena",
  estable: "estable",
  "inflexion-positiva": "giro ↑",
  "inflexion-negativa": "giro ↓",
};

export function MarketView({
  players,
  squadIds,
  listings,
  listingsDate,
  today,
  budget,
  snapshotDays,
}: {
  players: PlayerView[];
  squadIds: string[];
  listings: MarketListing[];
  listingsDate: string | null;
  today: string;
  budget: number;
  snapshotDays: number;
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "">("");
  const [team, setTeam] = useState("");
  const [minM, setMinM] = useState("");
  const [maxM, setMaxM] = useState("");
  const [trend, setTrend] = useState<"" | "sube" | "baja" | "estable">("");
  const [status, setStatus] = useState<PlayerStatus | "">("");
  const [minProb, setMinProb] = useState(0);
  const [onlyListed, setOnlyListed] = useState(false);
  const [hideMine, setHideMine] = useState(true);
  const [sort, setSort] = useState<SortKey>("opportunity");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [limit, setLimit] = useState(60);
  const [detail, setDetail] = useState<PlayerView | null>(null);

  const mine = useMemo(() => new Set(squadIds), [squadIds]);
  const listed = useMemo(() => new Map(listings.map((l) => [l.playerId, l])), [listings]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const filtered = useMemo(() => {
    const n = normalizeName(q);
    const lo = minM ? Number(minM.replace(",", ".")) * 1e6 : null;
    const hi = maxM ? Number(maxM.replace(",", ".")) * 1e6 : null;
    const val = (p: PlayerView): number => {
      switch (sort) {
        case "name": return 0;
        case "value": return p.value ?? -1;
        case "change1": return p.change1 ?? -1e12;
        case "pct1": return p.pct1 ?? -1e9;
        case "pct7": return p.pct7 ?? -1e9;
        case "points": return p.pointsTotal ?? -1;
        case "avg": return p.pointsAvg ?? -1;
        case "pPlay": return p.pPlay;
        case "xp": return p.xp;
        default: return p.opportunity;
      }
    };
    return players
      .filter((p) => {
        if (n && !normalizeName(p.name).includes(n) && !normalizeName(getTeam(p.teamId)?.name ?? "").includes(n)) return false;
        if (pos && p.position !== pos) return false;
        if (team && p.teamId !== team) return false;
        if (lo != null && (p.value ?? 0) < lo) return false;
        if (hi != null && (p.value ?? 0) > hi) return false;
        if (trend && p.direction !== trend) return false;
        if (status && p.status !== status) return false;
        if (minProb && p.pPlay * 100 < minProb) return false;
        if (onlyListed && !listed.has(p.id)) return false;
        if (hideMine && mine.has(p.id)) return false;
        return true;
      })
      .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) * dir : (val(a) - val(b)) * dir));
  }, [players, q, pos, team, minM, maxM, trend, status, minProb, onlyListed, hideMine, sort, dir, listed, mine]);

  const th = (k: SortKey, label: string, cls = "") => (
    <th
      className={`cursor-pointer select-none whitespace-nowrap ${cls} ${sort === k ? "!text-cyan" : ""}`}
      onClick={() => {
        if (sort === k) setDir(dir === 1 ? -1 : 1);
        else {
          setSort(k);
          setDir(k === "name" ? 1 : -1);
        }
      }}
    >
      {label} {sort === k ? (dir === -1 ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="space-y-6">
      <DailyMarket players={players} listings={listings} listingsDate={listingsDate} today={today} squadIds={squadIds} onOpen={(id) => setDetail(byId.get(id) ?? null)} />

      <section className="panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-cyan" />
          <h2 className="font-display text-[16.5px] font-semibold">Todos los jugadores</h2>
          <span className="text-[12px] text-muted">{filtered.length} de {players.length}</span>
        </div>
        <div className="mb-4 flex flex-wrap gap-2 [&>*]:min-w-[150px] [&>select]:w-auto">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="input !pl-8" placeholder="Jugador o equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input" value={pos} onChange={(e) => setPos(e.target.value as Position | "")} aria-label="Posición">
            <option value="">Posición: todas</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Equipo">
            <option value="">Equipo: todos</option>
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex w-[190px] items-center gap-1">
            <input className="input num" placeholder="mín M" value={minM} onChange={(e) => setMinM(e.target.value)} inputMode="decimal" aria-label="Precio mínimo en millones" />
            <span className="text-dim">–</span>
            <input className="input num" placeholder="máx M" value={maxM} onChange={(e) => setMaxM(e.target.value)} inputMode="decimal" aria-label="Precio máximo en millones" />
          </div>
          <select className="input" value={trend} onChange={(e) => setTrend(e.target.value as typeof trend)} aria-label="Tendencia">
            <option value="">Tendencia: todas</option>
            <option value="sube">Subiendo</option>
            <option value="baja">Bajando</option>
            <option value="estable">Estable</option>
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PlayerStatus | "")} aria-label="Estado">
            <option value="">Estado: todos</option>
            {(Object.keys(STATUS_LABEL) as PlayerStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <label className="flex w-[200px] items-center gap-2 whitespace-nowrap text-[12px] text-muted">
            Juega ≥ {minProb}%
            <input type="range" min={0} max={90} step={10} value={minProb} onChange={(e) => setMinProb(Number(e.target.value))} className="flex-1 accent-cyan" />
          </label>
        </div>
        <div className="mb-3 flex flex-wrap gap-4 text-[12.5px] text-muted">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-cyan" checked={onlyListed} onChange={(e) => setOnlyListed(e.target.checked)} /> Solo mi mercado del día ({listings.length})
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-cyan" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} /> Ocultar mis jugadores
          </label>
          {snapshotDays < 3 && <span className="text-dim">Tendencias calculadas con el histórico publicado por la fuente; las propias se acumulan con cada sincronización diaria.</span>}
        </div>

        {players.length === 0 ? (
          <Empty title="No hay jugadores todavía">Sincroniza los precios (botón superior) o crea jugadores a mano desde «Mi equipo».</Empty>
        ) : (
          <div className="-mx-4 max-h-[70vh] overflow-auto">
            <table className="table-compact w-full min-w-[1180px]">
              <thead>
                <tr>
                  {th("name", "Jugador")}
                  {th("value", "Valor", "!text-right")}
                  <th className="!text-right">Anterior</th>
                  {th("change1", "Var.", "!text-right")}
                  {th("pct7", "7 días", "!text-right")}
                  <th>Tendencia</th>
                  {th("points", "Pts", "!text-right")}
                  {th("avg", "Media", "!text-right")}
                  {th("pPlay", "Juega")}
                  <th>Estado</th>
                  <th>Rival</th>
                  {th("xp", "Pts esp.", "!text-right")}
                  {th("opportunity", "Oport.")}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((p) => (
                  <tr key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <PosBadge pos={p.position} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 whitespace-nowrap font-medium">
                            {p.name}
                            {mine.has(p.id) && <span className="rounded bg-cyan/15 px-1 text-[10px] text-cyan">MÍO</span>}
                            {listed.has(p.id) && <span className="rounded bg-up/15 px-1 text-[10px] text-up">EN MERCADO</span>}
                          </div>
                          <TeamChip teamId={p.teamId} short />
                        </div>
                      </div>
                    </td>
                    <td className="num whitespace-nowrap text-right font-semibold" title={fmtMoney(p.value)}>{fmtCompact(p.value)}</td>
                    <td className="num whitespace-nowrap text-right text-muted" title={fmtMoney(p.prev)}>{fmtCompact(p.prev)}</td>
                    <td className="whitespace-nowrap text-right">
                      <div className={`num text-[12.5px] ${p.change1 == null ? "text-dim" : p.change1 > 0 ? "text-up" : p.change1 < 0 ? "text-down" : "text-muted"}`}>{fmtSigned(p.change1)}</div>
                      <Delta pct={p.pct1} size="xs" />
                    </td>
                    <td className="text-right"><Delta pct={p.pct7} size="xs" /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Sparkline data={p.series} width={70} height={24} />
                        {p.accelLabel && <span className={`text-[11px] ${p.accelLabel.includes("positiva") || (p.accelLabel === "acelera" && p.direction === "sube") ? "text-up" : p.accelLabel.includes("negativa") || (p.accelLabel === "acelera" && p.direction === "baja") ? "text-down" : "text-muted"}`}>{ACCEL[p.accelLabel]}</span>}
                      </div>
                    </td>
                    <td className="num text-right">{p.pointsTotal ?? "—"}</td>
                    <td className="num text-right text-muted">{p.pointsAvg?.toFixed(1) ?? "—"}</td>
                    <td><ProbBar p={p.pPlaySource === "supuesto" ? null : p.pPlay} source={p.pPlaySource} /></td>
                    <td><StatusBadge status={p.status} note={p.statusNote} /></td>
                    <td>
                      {p.opponentId ? (
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[11px] text-dim">{p.home ? "vs" : "@"}</span>
                          <TeamChip teamId={p.opponentId} short />
                          <Difficulty d={p.difficulty} />
                        </div>
                      ) : <span className="text-dim">—</span>}
                    </td>
                    <td className="num text-right text-gold">{p.xp.toFixed(1)}</td>
                    <td><ScoreRing score={p.opportunity} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!mine.has(p.id) && (listed.has(p.id) ? <Check size={15} className="text-up" /> : <QuickList id={p.id} value={p.value} today={today} />)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="py-3 text-center">
                <button className="btn-ghost" onClick={() => setLimit(limit + 100)}>Ver {Math.min(100, filtered.length - limit)} más</button>
              </div>
            )}
          </div>
        )}
      </section>

      {detail && <PlayerDetail p={detail} onClose={() => setDetail(null)} owned={mine.has(detail.id)} listing={listed.get(detail.id) ?? null} today={today} budget={budget} />}
    </div>
  );
}

function QuickList({ id, value, today }: { id: string; value: number | null; today: string }) {
  const { run, busy } = useAction();
  return (
    <button className="btn-ghost !px-1.5 !py-1" title="Añadir a mi mercado de hoy" disabled={busy} onClick={() => run({ type: "addListing", playerId: id, date: today, askingPrice: value })}>
      <Plus size={13} />
    </button>
  );
}
