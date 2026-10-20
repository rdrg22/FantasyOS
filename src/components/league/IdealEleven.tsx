import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pitch, type PitchSlot } from "../Pitch";
import { InfoTip } from "../ui";

export interface IdealElevenProps {
  matchday: number;
  /** Jornadas con puntos guardados (para las flechas) */
  matchdays: number[];
  /** La jornada aún no ha terminado: los puntos son provisionales */
  inProgress: boolean;
  formation: string;
  total: number;
  slots: PitchSlot[];
  /** Huecos ocupados por jugadores de tu plantilla */
  mineSlots: string[];
  /** Mejor once posible con tu plantilla actual en esa jornada */
  myBest: { total: number; formation: string } | null;
}

/** Once ideal de una jornada: los que más puntos hicieron, en la formación que más suma. */
export function IdealEleven({ matchday, matchdays, inProgress, formation, total, slots, mineSlots, myBest }: IdealElevenProps) {
  const idx = matchdays.indexOf(matchday);
  const prev = idx > 0 ? matchdays[idx - 1] : null;
  const next = idx >= 0 && idx < matchdays.length - 1 ? matchdays[idx + 1] : null;
  const mine = mineSlots.length;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <NavArrow md={prev} label="Jornada anterior"><ChevronLeft size={16} /></NavArrow>
        <div className="text-center">
          <h2 className="flex items-center justify-center gap-1.5 font-display text-[16.5px] font-semibold">
            Once ideal · J{matchday}
            <InfoTip align="right">
              Los once jugadores que más puntos hicieron en la jornada, en la formación permitida que más suma (sin entrenador). Puntos de FútbolFantasy; se guardan jornada a jornada desde que la app los sincroniza, así que no hay jornadas anteriores a esa fecha.
            </InfoTip>
          </h2>
          <div className="text-[11.5px] text-muted">
            {formation} · <span className="num font-semibold text-up">{total} pts</span>
            {inProgress && <span className="ml-1.5 rounded bg-gold/12 px-1.5 text-gold">En curso · provisional</span>}
          </div>
        </div>
        <NavArrow md={next} label="Jornada siguiente"><ChevronRight size={16} /></NavArrow>
      </div>

      <Pitch slots={slots} readOnly highlight={new Set(mineSlots)} />

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="panel-inset px-3 py-2">
          <div className="text-[11px] text-muted">Tuyos en el once ideal</div>
          <div className="num font-display text-lg font-semibold">{mine}<span className="text-sm text-muted"> / 11</span></div>
        </div>
        <div className="panel-inset px-3 py-2">
          <div className="flex items-center justify-center gap-1 text-[11px] text-muted">
            Tu mejor once
            <InfoTip align="right">
              Lo máximo que habría sumado tu plantilla actual en esa jornada eligiendo a los mejores en la mejor formación. Si has fichado o vendido después, no coincide con lo que alineaste.
            </InfoTip>
          </div>
          <div className="num font-display text-lg font-semibold">
            {myBest ? <>{myBest.total}<span className="text-sm text-muted"> pts</span></> : <span className="text-sm text-dim">—</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function NavArrow({ md, label, children }: { md: number | null; label: string; children: React.ReactNode }) {
  if (md == null)
    return (
      <span className="btn-ghost pointer-events-none !px-2 opacity-30" aria-hidden>
        {children}
      </span>
    );
  return (
    <Link href={`/liga?j=${md}`} scroll={false} className="btn-ghost !px-2" aria-label={label}>
      {children}
    </Link>
  );
}
