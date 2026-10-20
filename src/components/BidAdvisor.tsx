"use client";

import { useState } from "react";
import { Gavel, Users } from "lucide-react";
import type { BidAdvice, BidGoal } from "@/lib/analytics/bidding";
import { fmtMoney } from "@/lib/domain/money";
import { InfoTip } from "./ui";

/**
 * Muestra la puja recomendada y la máxima. `advice` trae una o las dos versiones del objetivo
 * (puntuar / ganar dinero); el usuario indica si alguien más ha pujado.
 */
export function BidAdvisor({ advice, defaultGoal, compact = false }: { advice: Partial<Record<BidGoal, BidAdvice>>; defaultGoal: BidGoal; compact?: boolean }) {
  const goals = (["puntos", "dinero"] as BidGoal[]).filter((g) => advice[g]);
  const [goal, setGoal] = useState<BidGoal>(advice[defaultGoal] ? defaultGoal : goals[0]);
  const [rivals, setRivals] = useState(false);
  const a = advice[goal];
  if (!a) return null;
  const rec = rivals ? a.recommendedRivals : a.recommendedAlone;

  return (
    <div className={`rounded-xl border border-cyan/25 bg-cyan/5 ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-cyan">
          <Gavel size={14} /> Asesor de puja
          <InfoTip>
            Puja recomendada: lo que te aconsejamos ofrecer. Puja máxima: por encima de esa cifra el fichaje deja de compensar. Las cifras acaban en 137 € para ganar a quien puja números redondos.
          </InfoTip>
        </span>
        {goals.length > 1 && (
          <div className="ml-auto flex rounded-lg border border-line p-0.5 text-[12px]">
            {goals.map((g) => (
              <button key={g} onClick={() => setGoal(g)} className={`rounded-md px-2 py-0.5 ${goal === g ? "bg-cyan/15 text-cyan" : "text-muted hover:text-fg"}`}>
                {g === "puntos" ? "Para puntuar" : "Para ganar dinero"}
              </button>
            ))}
          </div>
        )}
      </div>

      {a.verdict === "pujar" ? (
        <>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-cyan" checked={rivals} onChange={(e) => setRivals(e.target.checked)} />
            <Users size={14} className="text-muted" /> Alguien más ha pujado por él
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ink-900/70 px-3 py-2">
              <div className="text-[11px] text-muted">Puja recomendada</div>
              <div className="num font-display text-xl font-semibold text-up">{fmtMoney(rec)}</div>
            </div>
            <div className="rounded-lg bg-ink-900/70 px-3 py-2">
              <div className="text-[11px] text-muted">Máximo (no pases de aquí)</div>
              <div className="num font-display text-xl font-semibold text-gold">{fmtMoney(a.max)}</div>
            </div>
          </div>
          <div className="mt-2 text-[12px] text-muted">
            Precio mínimo {fmtMoney(a.floor)} · sobrepuja máxima +{fmtMoney((a.max ?? a.floor) - a.floor)}
            {a.saleNeeded && <span className="text-gold"> · necesitas vender a {a.saleNeeded.name}</span>}
          </div>
        </>
      ) : (
        <div className={`rounded-lg px-3 py-2 text-[13px] ${a.verdict === "sin-presupuesto" ? "bg-down/10 text-down" : "bg-gold/10 text-gold"}`}>
          {a.verdict === "sin-presupuesto" ? "No te llega el presupuesto para pujar por él." : `No compensa pagar más de su precio mínimo (${fmtMoney(a.floor)}) ${goal === "dinero" ? "para revenderlo" : "para puntuar"}.`}
        </div>
      )}
      {!compact && a.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
          {a.notes.slice(0, 2).map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
