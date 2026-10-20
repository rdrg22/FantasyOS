"use client";

import { useState } from "react";
import { FileUp, Store, Trash2, X } from "lucide-react";
import type { PlayerView } from "@/lib/services/state";
import type { MarketListing } from "@/lib/domain/types";
import { fmtCompact, fmtMoney } from "@/lib/domain/money";
import { fmtDate } from "@/lib/domain/time";
import { Delta, InfoTip, PosBadge, ScoreRing, TeamChip } from "../ui";
import { Modal } from "../Modal";
import { MoneyInput } from "../MoneyInput";
import { PlayerSearch } from "../squad/AddPlayerPanel";
import { useAction } from "../useAction";
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
  const [adding, setAdding] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [picked, setPicked] = useState<PlayerView | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [seller, setSeller] = useState("");
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
          <button className="btn-ghost" onClick={() => setAdding(!adding)}>{adding ? <X size={14} /> : "+"} Añadir jugador</button>
          <button className="btn-ghost" onClick={() => setCsvOpen(true)}><FileUp size={14} /> Importar CSV</button>
          {listings.length > 0 && listingsDate && (
            <button className="btn-ghost" disabled={busy} onClick={() => confirm("¿Vaciar el mercado registrado?") && run({ type: "clearListings", date: listingsDate })}>
              <Trash2 size={14} /> Vaciar
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="panel-inset mb-3 space-y-3 p-3">
          <PlayerSearch
            catalog={players.filter((p) => !own.has(p.id)).map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, position: p.position, value: p.value, status: p.status, source: p.source }))}
            onPick={(c) => { setPicked(byId.get(c.id) ?? null); setAsk(c.value); }}
            placeholder="Busca el jugador que aparece en tu mercado…"
          />
          {picked && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run({ type: "addListing", playerId: picked.id, date: today, askingPrice: ask, seller: seller || null });
                if (r.ok) { setPicked(null); setSeller(""); }
              }}
            >
              <div className="flex items-center gap-2 text-sm"><PosBadge pos={picked.position} /> <b>{picked.name}</b></div>
              <div className="w-44"><label className="label">Precio en tu mercado</label><MoneyInput value={ask} onChange={setAsk} /></div>
              <div className="w-40"><label className="label">Vendedor</label><input className="input" value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="LaLiga / mánager" maxLength={40} /></div>
              <button className="btn-up" disabled={busy}>Añadir</button>
            </form>
          )}
        </div>
      )}

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
                <div className="mt-0.5 flex items-center gap-2"><TeamChip teamId={p.teamId} short /><span className="truncate text-[11px] text-dim">{l.seller ?? ""}</span></div>
              </div>
              <div className="text-right">
                <div className="num text-sm font-semibold" title={fmtMoney(l.askingPrice ?? p.value)}>{fmtCompact(l.askingPrice ?? p.value)}</div>
                <Delta pct={p.pct1} size="xs" />
              </div>
              <button
                className="text-dim opacity-0 hover:text-down group-hover:opacity-100"
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
