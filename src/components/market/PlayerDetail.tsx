"use client";

import { useState } from "react";
import type { PlayerView } from "@/lib/services/state";
import type { MarketListing } from "@/lib/domain/types";
import { POSITION_LABEL } from "@/lib/domain/types";
import { fmtMoney, fmtPct, fmtSigned } from "@/lib/domain/money";
import { timeAgo } from "@/lib/domain/time";
import { Modal } from "../Modal";
import { PriceChart } from "../charts";
import { ConfidencePill, Delta, PosBadge, ProbBar, ScoreRing, StatusBadge, TeamChip } from "../ui";
import { TradeButton } from "../TradeButton";
import { MoneyInput } from "../MoneyInput";
import { useAction } from "../useAction";
import { BidAdvisor } from "../BidAdvisor";
import { NextFixtures } from "../NextFixtures";
import { computeBid, type BidContext } from "@/lib/analytics/bidding";

const SOURCE_LABEL: Record<string, string> = {
  futbolfantasy: "FútbolFantasy",
  manual: "introducido a mano",
  csv: "importado por CSV",
  demo: "DEMOSTRACIÓN",
};

export function PlayerDetail({ p, onClose, owned, listing, today, budget, bidContext }: { p: PlayerView; onClose: () => void; owned: boolean; listing: MarketListing | null; today: string; budget: number; bidContext: BidContext }) {
  const [ask, setAsk] = useState<number | null>(listing?.askingPrice ?? p.value);
  const [seller, setSeller] = useState(listing?.seller ?? "");
  const { run, busy } = useAction();
  const floor = listing?.askingPrice ?? p.value;
  const bidInput = floor
    ? {
        value: p.value ?? floor,
        floor,
        dailyRate: p.dailyRate,
        difficulties: p.upcoming.map((u) => u.difficulty),
        pointsGain2: p.gain2,
        pPlay: p.pPlay,
        status: p.status,
        confidence: p.confidence,
      }
    : null;
  const advice = bidInput ? { puntos: computeBid(bidInput, bidContext, "puntos"), dinero: computeBid(bidInput, bidContext, "dinero") } : null;
  const defaultGoal = p.gain2 >= 0.8 ? "puntos" : "dinero";
  const basis =
    p.trendBasis === "instantaneas" ? "precios guardados por la app (fechas reales)" : p.trendBasis === "fuente" ? "valores publicados por la fuente (N mercados atrás)" : p.trendBasis === "mixta" ? "precios propios + fuente" : "sin histórico";

  return (
    <Modal open onClose={onClose} wide title={<span className="flex items-center gap-2"><PosBadge pos={p.position} /> {p.name}</span>}>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <TeamChip teamId={p.teamId} />
        <span className="text-muted">{POSITION_LABEL[p.position]}</span>
        <StatusBadge status={p.status} note={p.statusNote} />
        {p.statusNote && <span className="text-[12px] text-muted">{p.statusNote}</span>}
        <ConfidencePill level={p.confidence} />
        <span className="text-[11.5px] text-dim">Fuente: {SOURCE_LABEL[p.source] ?? p.source} · {timeAgo(p.updatedAt)}{p.overridden.length ? ` · editado a mano: ${p.overridden.join(", ")}` : ""}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-2 flex items-baseline gap-3">
            <span className="num font-display text-2xl font-semibold">{fmtMoney(p.value)}</span>
            <Delta pct={p.pct1} abs={p.change1} />
          </div>
          <PriceChart data={p.series} />
          <p className="mt-1 text-[11px] text-dim">Histórico: {basis}.</p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Mini label="1 mercado" v={<Delta pct={p.pct1} size="xs" />} />
            <Mini label="3 días" v={<Delta pct={p.pct3} size="xs" />} />
            <Mini label="7 días" v={<Delta pct={p.pct7} size="xs" />} />
            <Mini label="Racha (fuente)" v={<span className="num text-[12px]">{p.streakDays != null ? `${p.streakDays > 0 ? "+" : ""}${p.streakDays} d` : "—"}</span>} />
          </div>
        </div>
        <div className="space-y-2.5 text-[13px]">
          <Row k="Oportunidad" v={<span className="flex items-center gap-2"><ScoreRing score={p.opportunity} /><span className="text-[11.5px] text-muted">valor {p.valueScore} · puntos {p.pointsScore}</span></span>} />
          <Row k="Puntos esperados" v={<span className="num font-semibold text-gold">{p.xp.toFixed(1)} <span className="font-normal text-muted">· {p.xp2.toFixed(1)} en 2 jornadas</span></span>} />
          <Row k="Puntos totales / media" v={<span className="num">{p.pointsTotal ?? "—"} · {p.pointsAvg?.toFixed(2) ?? "—"}</span>} />
          <Row k="Últimas 5 jornadas" v={<span className="num">{p.points5 ?? "—"} pts en {p.played5 ?? "—"} partidos</span>} />
          <Row k="Prob. de jugar" v={<ProbBar p={p.pPlaySource === "supuesto" ? null : p.pPlay} source={p.pPlaySource} />} />
          <Row k="Origen de la prob." v={<span className="text-muted">{{ "alineacion-probable": "alineación probable", fuente: "FútbolFantasy (mercado)", historial: "partidos recientes", estado: "estado físico", supuesto: "sin dato (se supone 50%)" }[p.pPlaySource]}</span>} />
          <Row k="Próximos rivales" v={p.upcoming.length ? <NextFixtures upcoming={p.upcoming} /> : <span className="text-dim">—</span>} />
          {p.lineupRole && <Row k="Alineación probable" v={<span className="capitalize">{p.lineupRole}</span>} />}
        </div>
      </div>

      {!owned && advice && (
        <div className="mt-5">
          <BidAdvisor advice={advice} defaultGoal={defaultGoal} />
        </div>
      )}

      <div className="mt-5 grid gap-3 border-t border-line pt-4 md:grid-cols-2">
        {!owned ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run({ type: "addListing", playerId: p.id, date: today, askingPrice: ask, seller: seller || null });
            }}
          >
            <div className="eyebrow">{listing ? "En tu mercado de hoy" : "Añadir a mi mercado de hoy"}</div>
            <div className="grid grid-cols-2 gap-2">
              <MoneyInput value={ask} onChange={setAsk} placeholder="Precio pedido" />
              <input className="input" placeholder="Vendedor (opcional)" value={seller} onChange={(e) => setSeller(e.target.value)} maxLength={40} />
            </div>
            <button className="btn-ghost w-full" disabled={busy}>{listing ? "Actualizar precio" : "Añadir al mercado del día"}</button>
          </form>
        ) : (
          <p className="text-[13px] text-muted">Este jugador ya está en tu plantilla.</p>
        )}
        <div className="flex flex-col justify-end gap-2">
          {!owned && (
            <>
              <TradeButton mode="buy" playerId={p.id} playerName={p.name} suggestedPrice={ask ?? p.value} />
              {ask != null && <p className={`text-center text-[11.5px] ${budget - ask < 0 ? "text-down" : "text-dim"}`}>Saldo tras comprar: {fmtMoney(budget - ask)} ({fmtSigned(-ask)})</p>}
            </>
          )}
          {owned && <TradeButton mode="sell" playerId={p.id} playerName={p.name} suggestedPrice={p.value} />}
        </div>
      </div>
    </Modal>
  );
}

function Mini({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="panel-inset px-2 py-1.5">
      <div className="text-[10.5px] text-dim">{label}</div>
      {v}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5">
      <span className="text-muted">{k}</span>
      {v}
    </div>
  );
}
