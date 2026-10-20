"use client";

import { useState } from "react";
import { ChevronDown, TrendingUp, Target, Layers, ShieldAlert, Wallet, Shirt, Database } from "lucide-react";
import type { Recommendation } from "@/lib/analytics/recommendations";
import { fmtMoney } from "@/lib/domain/money";
import { ActionTag, ConfidencePill, PosBadge, TeamChip } from "./ui";
import { TradeButton } from "./TradeButton";

const INTENT: Record<string, { label: string; icon: typeof TrendingUp; cls: string }> = {
  revalorizacion: { label: "Para revalorizar", icon: TrendingUp, cls: "text-up" },
  puntos: { label: "Para puntuar", icon: Target, cls: "text-gold" },
  mixta: { label: "Valor + puntos", icon: Layers, cls: "text-cyan" },
};

export function RecommendationCard({
  rec,
  rank,
  teamId,
  defaultOpen = false,
  compact = false,
  ownsPlayer = false,
}: {
  rec: Recommendation;
  rank?: number;
  teamId?: string | null;
  defaultOpen?: boolean;
  compact?: boolean;
  ownsPlayer?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const intent = rec.intent ? INTENT[rec.intent] : null;
  const accent =
    rec.action === "COMPRAR" ? "before:bg-up" : rec.action === "VENDER" || rec.action === "SALDO" ? "before:bg-down" : rec.action === "VIGILAR" ? "before:bg-gold" : rec.action === "ALINEAR" ? "before:bg-cyan" : "before:bg-ink-500";

  return (
    <article className={`panel-inset relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${accent}`}>
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        {rank != null && <span className="num w-5 shrink-0 font-display text-lg font-semibold text-dim">{rank}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ActionTag action={rec.action} />
            {rec.position && <PosBadge pos={rec.position} />}
            {teamId !== undefined && <TeamChip teamId={teamId} short />}
            {intent && (
              <span className={`inline-flex items-center gap-1 text-[11.5px] ${intent.cls}`}>
                <intent.icon size={13} /> {intent.label}
              </span>
            )}
          </div>
          <div className="mt-1.5 truncate font-medium">{rec.title}</div>
          {!compact && <div className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{rec.reasons[0]}</div>}
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          {rec.price != null && <div className="num text-sm font-semibold">{fmtMoney(rec.price)}</div>}
          <div className="mt-1">
            <ConfidencePill level={rec.confidence.level} />
          </div>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="grid gap-4 border-t border-line px-4 py-4 text-[13px] md:grid-cols-2">
          <Block icon={<Target size={14} />} title="Motivo">
            <List items={rec.reasons} />
          </Block>
          <Block icon={<TrendingUp size={14} className="text-up" />} title="Beneficios potenciales">
            <List items={rec.benefits.length ? rec.benefits : ["—"]} />
          </Block>
          <Block icon={<ShieldAlert size={14} className="text-down" />} title="Riesgos e incertidumbre">
            <List items={rec.risks.length ? rec.risks : ["Sin riesgos destacados con los datos disponibles."]} />
          </Block>
          <Block icon={<Wallet size={14} className="text-cyan" />} title="Efecto en el presupuesto">
            <div className="num grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <span className="text-muted">Saldo actual</span>
              <span>{fmtMoney(rec.budget.before)}</span>
              {rec.budget.income > 0 && (
                <>
                  <span className="text-muted">{rec.replaces ? `Venta de ${rec.replaces.playerName}` : "Ingreso por venta"}</span>
                  <span className="text-up">+{fmtMoney(rec.budget.income)}</span>
                </>
              )}
              {rec.budget.cost > 0 && (
                <>
                  <span className="text-muted">Coste</span>
                  <span className="text-down">−{fmtMoney(rec.budget.cost)}</span>
                </>
              )}
              <span className="text-muted">Saldo resultante</span>
              <span className={rec.budget.after < 0 ? "font-semibold text-down" : "font-semibold"}>{fmtMoney(rec.budget.after)}</span>
            </div>
            {rec.budget.note && <p className="mt-1.5 text-[12px] text-gold">{rec.budget.note}</p>}
          </Block>
          <Block icon={<Shirt size={14} className="text-gold" />} title="Impacto en tu alineación">
            <p className="text-muted">{rec.lineupImpact}</p>
          </Block>
          <Block icon={<Database size={14} className="text-violet" />} title="Confianza y datos usados">
            <ConfidencePill level={rec.confidence.level} />
            <p className="mt-1 text-[12px] text-muted">Usados: {rec.confidence.used.join(", ") || "—"}</p>
            {rec.confidence.missing.length > 0 && <p className="text-[12px] text-gold">Faltan: {rec.confidence.missing.join(", ")}</p>}
          </Block>
          {rec.playerId && (rec.action === "COMPRAR" || rec.action === "VENDER") && (
            <div className="flex flex-wrap gap-2 md:col-span-2">
              {rec.action === "VENDER" && ownsPlayer && <TradeButton mode="sell" playerId={rec.playerId} playerName={rec.playerName} suggestedPrice={rec.price} />}
              {rec.action === "COMPRAR" && rec.replaces && (
                <TradeButton mode="sell" playerId={rec.replaces.playerId} playerName={rec.replaces.playerName} suggestedPrice={rec.replaces.saleValue} label={`1. Registrar venta de ${rec.replaces.playerName}`} />
              )}
              {rec.action === "COMPRAR" && (
                <TradeButton mode="buy" playerId={rec.playerId} playerName={rec.playerName} suggestedPrice={rec.price} label={rec.replaces ? `2. Registrar compra de ${rec.playerName}` : undefined} />
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-fg/90">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-dim" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
