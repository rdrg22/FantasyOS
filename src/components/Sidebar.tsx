"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, CalendarDays, Database, LayoutDashboard, HelpCircle, LogOut, Menu, ShoppingCart, Sparkles, Users, X, Shirt } from "lucide-react";
import { timeAgo } from "@/lib/domain/time";
import { WorkspaceSwitch } from "./WorkspaceSwitch";

const NAV = [
  { href: "/", label: "Hoy", icon: LayoutDashboard, hint: "Qué debería hacer" },
  { href: "/recomendaciones", label: "Recomendaciones", icon: Sparkles, hint: "Comprar · vender · vigilar" },
  { href: "/plantilla", label: "Mi equipo", icon: Users, hint: "Plantilla y presupuesto" },
  { href: "/mercado", label: "Mercado", icon: ShoppingCart, hint: "Precios y oportunidades" },
  { href: "/alineacion", label: "Once ideal", icon: Shirt, hint: "Recomendador de alineación" },
  { href: "/jornada", label: "Jornada", icon: CalendarDays, hint: "Partidos y alineaciones probables" },
  { href: "/datos", label: "Datos y fuentes", icon: Database, hint: "Sincronización y ajustes" },
  { href: "/ayuda", label: "Ayuda", icon: HelpCircle, hint: "Glosario, metodología y fuentes" },
];

const MOBILE = [
  { href: "/", short: "Hoy", icon: LayoutDashboard },
  { href: "/recomendaciones", short: "Consejos", icon: Sparkles },
  { href: "/mercado", short: "Mercado", icon: ShoppingCart },
  { href: "/plantilla", short: "Equipo", icon: Users },
];

export interface FreshnessInfo {
  market: string | null;
  fixtures: string | null;
  lineups: string | null;
}

export function Sidebar({ workspace, teamName, freshness, canLogout = false }: { workspace: "real" | "demo"; teamName: string; freshness: FreshnessInfo; canLogout?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const lastMarketSync = freshness.market;
  const old = (at: string | null, hours: number) => !at || Date.now() - Date.parse(at) > hours * 3600 * 1000;
  const stale = old(freshness.market, 26);
  const anyStale = stale || old(freshness.fixtures, 72) || old(freshness.lineups, 12);
  const detail = [
    `Precios y puntos: ${freshness.market ? timeAgo(freshness.market) : "sin sincronizar"}`,
    `Calendario: ${freshness.fixtures ? timeAgo(freshness.fixtures) : "sin sincronizar"}`,
    `Alineaciones: ${freshness.lineups ? timeAgo(freshness.lineups) : "sin sincronizar"}`,
  ].join("\n");

  const nav = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-6 pt-5" onClick={() => setOpen(false)}>
        <Logo />
        <div className="leading-none">
          <div className="font-display text-[19px] font-semibold tracking-tight">
            Fantasy<span className="text-cyan">OS</span>
          </div>
          <div className="mt-1 truncate text-[11px] text-muted">{teamName}</div>
        </div>
      </Link>

      <div className="eyebrow px-5 pb-2">Panel</div>
      <ul className="space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                title={n.hint}
                onClick={() => setOpen(false)}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                  active ? "bg-cyan/10 text-fg" : "text-muted hover:bg-ink-800 hover:text-fg"
                }`}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-cyan shadow-[0_0_12px_rgba(45,212,240,0.8)]" />}
                <Icon size={17} className={active ? "text-cyan" : "text-dim group-hover:text-muted"} />
                <span className="text-[13.5px] font-medium">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-3 p-4">
        <WorkspaceSwitch workspace={workspace} />
        <Link href="/datos" title={workspace === "demo" ? undefined : detail} className="panel-inset flex items-center gap-2 px-3 py-2 text-[11.5px]" onClick={() => setOpen(false)}>
          <Activity size={14} className={workspace === "demo" ? "text-gold" : stale ? "text-down" : anyStale ? "text-gold" : "text-up"} />
          <span className="text-muted">
            {workspace === "demo" ? "Datos de demostración" : lastMarketSync ? <>Datos: {timeAgo(lastMarketSync)}</> : "Datos sin sincronizar"}
          </span>
        </Link>
        {canLogout && (
          <form action="/api/auth/signout" method="post">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-dim hover:bg-ink-800 hover:text-fg">
              <LogOut size={14} /> Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </nav>
  );

  return (
    <>
      {/* Móvil: barra inferior con las secciones más usadas; «Más» abre el menú completo */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegación principal">
        <ul className="grid grid-cols-5">
          {MOBILE.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <li key={n.href}>
                <Link href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] ${active ? "text-cyan" : "text-muted"}`}>
                  <Icon size={20} />
                  {n.short}
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setOpen(true)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[10.5px] text-muted" aria-label="Más secciones">
              <Menu size={20} />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-ink-900/95 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-line bg-ink-900 pt-[env(safe-area-inset-top)]" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 text-dim" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4f0" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <path d="M16 2 28 9v14l-12 7L4 23V9z" fill="none" stroke="url(#lg)" strokeWidth="2" />
      <path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="url(#lg)" opacity="0.9" />
      <path d="M8 22l5-5 3 3 7-8" fill="none" stroke="#050a14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
