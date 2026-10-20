import { getTeam } from "@/lib/domain/teams";

export interface UpcomingView {
  matchday: number;
  opponentId: string | null;
  home: boolean | null;
  difficulty: number | null;
}

const TONE = (d: number | null) =>
  d == null ? "border-ink-600 text-muted" : d >= 4 ? "border-down/50 bg-down/10 text-down" : d === 3 ? "border-gold/40 bg-gold/10 text-gold" : "border-up/40 bg-up/10 text-up";

const LABEL = (d: number | null) => (d == null ? "dificultad desconocida" : d >= 4 ? "rival difícil" : d === 3 ? "rival medio" : "rival asequible");

/** Rivales de las dos próximas jornadas, coloreados por dificultad (verde fácil, ámbar medio, rojo difícil). */
export function NextFixtures({ upcoming, size = "sm" }: { upcoming: UpcomingView[]; size?: "sm" | "xs" }) {
  if (!upcoming.length) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {upcoming.map((u) => {
        const t = getTeam(u.opponentId);
        return (
          <span
            key={u.matchday}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1 font-mono ${size === "xs" ? "text-[9.5px]" : "text-[10.5px]"} ${TONE(u.difficulty)}`}
            title={`Jornada ${u.matchday}: ${u.home === false ? "fuera" : u.home ? "en casa" : ""} contra ${t?.name ?? "—"} (${LABEL(u.difficulty)})`}
          >
            <span className="opacity-60">J{u.matchday}</span>
            {t ? `${u.home === false ? "@" : ""}${t.short}` : "—"}
          </span>
        );
      })}
    </span>
  );
}
