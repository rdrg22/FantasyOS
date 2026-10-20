import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Info } from "lucide-react";
import { getTeam } from "@/lib/domain/teams";
import { Jersey } from "./Jersey";
import { fmtCompact, fmtPct } from "@/lib/domain/money";
import { timeAgo } from "@/lib/domain/time";
import type { PlayerStatus, Position } from "@/lib/domain/types";
import { STATUS_LABEL } from "@/lib/domain/types";

/** Icono ⓘ con explicación al pasar el ratón o al enfocarlo con el teclado. */
export function InfoTip({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" className="inline-flex text-dim transition-colors hover:text-cyan focus:text-cyan focus:outline-none" aria-label="Más información">
        <Info size={14} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-6 z-50 hidden w-[min(18rem,calc(100vw-2.5rem))] rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-left text-[12.5px] font-normal normal-case leading-snug tracking-normal text-fg/90 shadow-2xl group-focus-within:block group-hover:block ${align === "right" ? "right-0" : "-left-24 sm:left-0"}`}
      >
        {children}
      </span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div>
        <div className="eyebrow mb-1.5 text-cyan/80">{eyebrow}</div>
        <h1 className="flex items-center gap-2 font-display text-[24px] font-semibold leading-none tracking-tight sm:text-[28px]">
          {title}
          {subtitle && <InfoTip>{subtitle}</InfoTip>}
        </h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Kpi({ label, value, sub, tone = "fg", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "fg" | "up" | "down" | "cyan" | "gold"; icon?: ReactNode }) {
  const color = { fg: "text-fg", up: "text-up", down: "text-down", cyan: "text-cyan", gold: "text-gold" }[tone];
  return (
    <div className="panel-inset min-w-0 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
        {icon}
        {label}
      </div>
      <div className={`num mt-1 truncate font-display text-[22px] font-semibold leading-tight ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-dim">{sub}</div>}
    </div>
  );
}

export function Section({ title, eyebrow, actions, info, children, className = "" }: { title: ReactNode; eyebrow?: string; actions?: ReactNode; info?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
          <h2 className="flex items-center gap-2 font-display text-[16.5px] font-semibold tracking-tight">
            {title}
            {info && <InfoTip>{info}</InfoTip>}
          </h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const POS_STYLE: Record<Position, string> = {
  POR: "bg-gold/15 text-gold border-gold/30",
  DEF: "bg-cyan/12 text-cyan border-cyan/30",
  MED: "bg-up/12 text-up border-up/30",
  DEL: "bg-down/12 text-down border-down/30",
  ENT: "bg-violet/15 text-violet border-violet/30",
};

export function PosBadge({ pos }: { pos: Position }) {
  return <span className={`inline-flex w-9 justify-center rounded border px-1 py-px font-mono text-[10px] font-semibold ${POS_STYLE[pos]}`}>{pos}</span>;
}

export function TeamChip({ teamId, short = false, icon = true }: { teamId: string | null; short?: boolean; icon?: boolean }) {
  const t = getTeam(teamId);
  if (!t) return <span className="text-dim">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted">
      {icon && <Jersey teamId={t.id} size={16} />}
      {short ? t.short : t.name}
    </span>
  );
}

const STATUS_STYLE: Record<PlayerStatus, string> = {
  disponible: "text-up",
  duda: "text-gold",
  lesionado: "text-down",
  sancionado: "text-down",
  desconocido: "text-dim",
};

export function StatusBadge({ status, note }: { status: PlayerStatus; note?: string | null }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] ${STATUS_STYLE[status]}`} title={note ?? undefined}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Delta({ pct, abs, size = "sm" }: { pct: number | null; abs?: number | null; size?: "sm" | "xs" }) {
  if (pct == null) return <span className="text-dim">—</span>;
  const up = pct > 0.05, down = pct < -0.05;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={`num inline-flex items-center gap-0.5 whitespace-nowrap ${size === "xs" ? "text-[11.5px]" : "text-[13px]"} ${up ? "text-up" : down ? "text-down" : "text-muted"}`}>
      <Icon size={size === "xs" ? 12 : 14} />
      {fmtPct(pct)}
      {abs != null && <span className="ml-1 text-[11px] opacity-75">({abs > 0 ? "+" : ""}{fmtCompact(abs)})</span>}
    </span>
  );
}

export function ProbBar({ p, source }: { p: number | null; source?: string }) {
  if (p == null) return <span className="text-dim">—</span>;
  const pct = Math.round(p * 100);
  const color = pct >= 70 ? "bg-up" : pct >= 40 ? "bg-gold" : "bg-down";
  return (
    <span className="inline-flex items-center gap-2" title={source ? `Fuente: ${source}` : undefined}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-700">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`num text-[12px] ${source === "supuesto" ? "text-dim italic" : "text-muted"}`}>{pct}%</span>
    </span>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const s = Math.round(score);
  const color = s >= 70 ? "#22c55e" : s >= 50 ? "#2dd4f0" : s >= 35 ? "#f5b82e" : "#5a6a85";
  const c = 2 * Math.PI * 13;
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center" title={`Puntuación de oportunidad: ${s}/100`}>
      <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
        <circle cx="16" cy="16" r="13" fill="none" stroke="#16243d" strokeWidth="3" />
        <circle cx="16" cy="16" r="13" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(c * s) / 100} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="num absolute text-[10.5px] font-semibold">{s}</span>
    </span>
  );
}

const ACTION_STYLE: Record<string, string> = {
  COMPRAR: "bg-up/15 text-up border-up/40",
  VENDER: "bg-down/15 text-down border-down/40",
  MANTENER: "bg-ink-700 text-muted border-ink-500",
  VIGILAR: "bg-gold/12 text-gold border-gold/40",
  ALINEAR: "bg-cyan/12 text-cyan border-cyan/40",
  SALDO: "bg-down/20 text-down border-down/60",
};

export function ActionTag({ action }: { action: string }) {
  return <span className={`inline-flex rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wider ${ACTION_STYLE[action] ?? ""}`}>{action}</span>;
}

export function ConfidencePill({ level }: { level: "baja" | "media" | "alta" }) {
  const bars = level === "alta" ? 3 : level === "media" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted" title="Confianza según los datos disponibles">
      <span className="flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= bars ? (level === "alta" ? "bg-up" : level === "media" ? "bg-cyan" : "bg-gold") : "bg-ink-600"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      confianza {level}
    </span>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-600 px-6 py-10 text-center">
      <div className="mb-2 text-dim">{icon ?? <Info size={22} />}</div>
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Freshness({ label, at, staleHours = 26 }: { label: string; at: string | null; staleHours?: number }) {
  const stale = !at || Date.now() - Date.parse(at) > staleHours * 3600 * 1000;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted" title={at ?? "sin datos"}>
      <span className={`h-1.5 w-1.5 rounded-full ${!at ? "bg-dim" : stale ? "bg-down" : "bg-up"}`} />
      {label}: {at ? timeAgo(at) : "sin datos"}
      {at && stale && <span className="text-down">(desactualizado)</span>}
    </span>
  );
}

export function Difficulty({ d }: { d: number | null }) {
  if (d == null) return <span className="text-dim">—</span>;
  const color = d >= 4 ? "bg-down" : d === 3 ? "bg-gold" : "bg-up";
  return (
    <span className="inline-flex gap-[2px]" title={`Dificultad del rival ${d}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-2.5 w-1.5 rounded-sm ${i <= d ? color : "bg-ink-600"}`} />
      ))}
    </span>
  );
}
