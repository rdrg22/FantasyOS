"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Search, Store, Trash2, X } from "lucide-react";
import type { PlayerView } from "@/lib/services/state";
import type { MarketListing } from "@/lib/domain/types";
import { fmtCompact, fmtMoney } from "@/lib/domain/money";
import { fmtDate } from "@/lib/domain/time";
import { Delta, InfoTip, PosBadge, ScoreRing, TeamChip } from "../ui";
import { Modal } from "../Modal";
import { normalizeName } from "@/lib/domain/normalize";
import { getTeam } from "@/lib/domain/teams";
import { useAction } from "../useAction";
import { NextFixtures } from "../NextFixtures";
import { useToast } from "../Toast";

const TEMPLATE = "nombre;equipo;posicion;precio;vendedor\nPedri;Barcelona;MED;45000000;LaLiga\nNico Williams;Athletic;DEL;38.500.000;Mánager X\n";

export function DailyMarket({
  players,
  listings,
  listingsDate,
  today,
  squadIds,
  onOpen,
}: {
  players: PlayerView[];
  listings: MarketListing[];
  listingsDate: string | null;
  today: string;
  squadIds: string[];
  onOpen: (id: string) => void;
}) {
  const [csvOpen, setCsvOpen] = useState(false);
  const { run, busy } = useAction();
  const byId = new Map(players.map((p) => [p.id, p]));
  const own = new Set(squadIds);
  const isToday = listingsDate === today;
  const rows = listings
    .map((l) => ({ l, p: byId.get(l.playerId) }))
    .filter((x): x is { l: MarketListing; p: PlayerView } => Boolean(x.p))
    .sort((a, b) => b.p.opportunity - a.p.opportunity);

  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">Tu liga</div>
          <h2 className="flex items-center gap-2 font-display text-[16.5px] font-semibold">
            <Store size={16} className="text-up" /> Mi mercado {listingsDate ? `del ${fmtDate(listingsDate)}` : "de hoy"}
            {listingsDate && !isToday && <span className="rounded bg-gold/15 px-1.5 text-[11px] font-normal text-gold">no es de hoy</span>}
            <InfoTip>Los jugadores que ves hoy en el mercado de tu liga. Las recomendaciones de compra priorizan estos; sin ellos usan el catálogo completo y bajan su confianza.</InfoTip>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setCsvOpen(true)}><FileUp size={14} /> Importar CSV</button>
          {listings.length > 0 && listingsDate && (
            <button className="btn-ghost" disabled={busy} onClick={() => confirm("¿Vaciar el mercado registrado?") && run({ type: "clearListings", date: listingsDate })}>
              <Trash2 size={14} /> Vaciar
            </button>
          )}
        </div>
      </div>

      <QuickAdd players={players} exclude={new Set([...own, ...(isToday ? listings.map((l) => l.playerId) : [])])} today={today} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-600 px-4 py-5 text-center text-[13px] text-muted">
          Aún no has registrado el mercado de tu liga de hoy.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ l, p }) => (
            <div key={l.id} className="panel-inset group flex cursor-pointer items-center gap-3 px-3 py-2 hover:border-ink-500" onClick={() => onOpen(p.id)}>
              <ScoreRing score={p.opportunity} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><PosBadge pos={p.position} /><span className="truncate text-sm font-medium">{p.name}</span></div>
                <div className="mt-0.5 flex items-center gap-2"><TeamChip teamId={p.teamId} short /><NextFixtures upcoming={p.upcoming} size="xs" /></div>
              </div>
              <div className="text-right">
                <div className="num text-sm font-semibold" title={fmtMoney(l.askingPrice ?? p.value)}>{fmtCompact(l.askingPrice ?? p.value)}</div>
                <Delta pct={p.pct1} size="xs" />
              </div>
              <button
                className="text-dim hover:text-down sm:opacity-0 sm:group-hover:opacity-100"
                title="Quitar del mercado del día"
                onClick={(e) => { e.stopPropagation(); run({ type: "removeListing", id: l.id }); }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <CsvImport open={csvOpen} onClose={() => setCsvOpen(false)} today={today} />
    </section>
  );
}

function CsvImport({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const [csv, setCsv] = useState("");
  const [createMissing, setCreateMissing] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const { run, busy } = useAction();
  const toast = useToast();

  return (
    <Modal open={open} onClose={onClose} title="Importar mercado del día (CSV)" wide>
      <div className="space-y-3 text-[13px]">
        <p className="text-muted">
          Columnas: <code className="text-cyan">nombre</code> (obligatoria), <code>equipo</code>, <code>posicion</code> (POR/DEF/MED/DEL), <code>precio</code>, <code>vendedor</code>. Separador «;» o «,». Los importes admiten «1.250.000», «1,25M» o «750k».
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost cursor-pointer">
            <FileUp size={14} /> Elegir archivo
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 500_000) return toast("error", "Archivo demasiado grande (máx. 500 KB).");
                setCsv(await f.text());
              }}
            />
          </label>
          <button
            className="btn-ghost"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "plantilla-mercado.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Descargar plantilla
          </button>
        </div>
        <textarea className="input h-48 font-mono text-[12px]" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={TEMPLATE} />
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" className="accent-cyan" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
          Crear los jugadores que no estén en el catálogo (necesitan posición)
        </label>
        {errors.length > 0 && (
          <ul className="max-h-32 overflow-y-auto rounded-lg border border-down/40 bg-down/10 p-2 text-[12px] text-down">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
          <button
            className="btn-primary"
            disabled={busy || !csv.trim()}
            onClick={async () => {
              const r = await run({ type: "importListingsCsv", csv, date: today, createMissing });
              const errs = (r.data as { errors?: string[] } | undefined)?.errors ?? [];
              setErrors(errs);
              if (r.ok && errs.length === 0) { setCsv(""); onClose(); }
            }}
          >
            Importar
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Alta rápida del mercado del día con el teclado: escribe, Intro, siguiente.
 * El precio se rellena con el valor de mercado (se puede cambiar abriendo el jugador).
 */
function QuickAdd({ players, exclude, today }: { players: PlayerView[]; exclude: Set<string>; today: string }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const { run, busy } = useAction();
  const results = useMemo(() => {
    const n = normalizeName(q);
    if (n.length < 2) return [];
    return players
      .filter((p) => !exclude.has(p.id) && !added.includes(p.id))
      .filter((p) => normalizeName(p.name).includes(n) || (p.shortName && normalizeName(p.shortName).includes(n)))
      .sort((a, b) => Number(normalizeName(b.name).startsWith(n)) - Number(normalizeName(a.name).startsWith(n)) || (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 6);
  }, [q, players, exclude, added]);

  async function add(p: PlayerView) {
    setQ("");
    setHi(0);
    setAdded((a) => [...a, p.id]);
    input.current?.focus();
    const r = await run({ type: "addListing", playerId: p.id, date: today, askingPrice: p.value, seller: null }, { silent: true });
    if (!r.ok) setAdded((a) => a.filter((x) => x !== p.id));
  }

  return (
    <div className="relative mb-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
        <input
          ref={input}
          className="input !py-2.5 !pl-9 text-[15px]"
          placeholder="Añadir al mercado de hoy: escribe un nombre y pulsa Intro"
          value={q}
          enterKeyHint="done"
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && results[hi]) { e.preventDefault(); add(results[hi]); }
            else if (e.key === "Escape") setQ("");
          }}
        />
        {busy && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-dim">guardando…</span>}
      </div>
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-600 bg-ink-850 shadow-2xl">
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${i === hi ? "bg-cyan/10" : "hover:bg-ink-800"}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => add(p)}
              >
                <PosBadge pos={p.position} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-[12px] text-muted">{getTeam(p.teamId)?.short}</span>
                <span className="num w-16 text-right text-[13px]">{fmtCompact(p.value)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
