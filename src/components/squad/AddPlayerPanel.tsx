"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { normalizeName } from "@/lib/domain/normalize";
import { fmtMoney } from "@/lib/domain/money";
import { TEAMS, getTeam } from "@/lib/domain/teams";
import { POSITIONS, POSITION_LABEL, STATUS_LABEL, type PlayerStatus, type Position } from "@/lib/domain/types";
import { MoneyInput } from "../MoneyInput";
import { PosBadge, StatusBadge, TeamChip } from "../ui";
import { useAction } from "../useAction";
import type { CatalogItem } from "./SquadManager";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

export function PlayerSearch({ catalog, onPick, placeholder = "Busca por nombre o equipo…" }: { catalog: CatalogItem[]; onPick: (c: CatalogItem) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<Position | "">("");
  const results = useMemo(() => {
    const n = normalizeName(q);
    if (n.length < 2 && !pos) return [];
    return catalog
      .filter((c) => (!pos || c.position === pos) && (n.length < 2 || normalizeName(c.name).includes(n) || normalizeName(getTeam(c.teamId)?.name ?? "").includes(n)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 30);
  }, [q, pos, catalog]);
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input !pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus />
        </div>
        <select className="input !w-auto" value={pos} onChange={(e) => setPos(e.target.value as Position | "")} aria-label="Posición">
          <option value="">Todas</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 divide-y divide-line/70 overflow-y-auto rounded-lg border border-line">
          {results.map((c) => (
            <li key={c.id}>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-800" onClick={() => onPick(c)}>
                <PosBadge pos={c.position} />
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <TeamChip teamId={c.teamId} short />
                <span className="num w-24 text-right text-sm">{fmtMoney(c.value)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && results.length === 0 && <p className="mt-2 text-[12.5px] text-muted">Sin resultados en el catálogo. Puedes crearlo a mano más abajo.</p>}
    </div>
  );
}

export function AddPlayerPanel({ catalog, budget, full }: { catalog: CatalogItem[]; budget: number; full: boolean }) {
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [mode, setMode] = useState<"buy" | "own">("own");
  const [price, setPrice] = useState<number | null>(null);
  const [date, setDate] = useState(todayStr());
  const { run, busy } = useAction();

  // creación manual
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [position, setPosition] = useState<Position>("MED");
  const [value, setValue] = useState<number | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("disponible");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || price == null || price <= 0) return;
    const r = await run(
      mode === "buy"
        ? { type: "buy", playerId: picked.id, price, date }
        : { type: "addToSquad", playerId: picked.id, purchasePrice: price, purchaseDate: date },
    );
    if (r.ok) setPicked(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await run({ type: "createPlayer", name, teamId: teamId || null, position, value, status });
    if (r.ok) {
      const id = (r.data as { id: string }).id;
      setPicked({ id, name, teamId: teamId || null, position, value, status, source: "manual" });
      setPrice(value);
      setName("");
    }
  }

  return (
    <div className="space-y-6">
      {full && <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-[13px] text-gold">Tu plantilla está completa. Vende o quita a alguien antes de añadir más.</div>}
      <div>
        <div className="eyebrow mb-2">1 · Busca el jugador</div>
        <PlayerSearch catalog={catalog} onPick={(c) => { setPicked(c); setPrice(c.value); }} />
      </div>

      {picked && (
        <form onSubmit={submit} className="panel-inset animate-rise space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <PosBadge pos={picked.position} />
            <span className="font-semibold">{picked.name}</span>
            <TeamChip teamId={picked.teamId} />
            <StatusBadge status={picked.status} />
            <span className="ml-auto text-[12px] text-muted">Valor actual: {fmtMoney(picked.value)}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-lg border p-3 text-[13px] ${mode === "own" ? "border-cyan/60 bg-cyan/5" : "border-line"}`}>
              <input type="radio" className="mr-2 accent-cyan" checked={mode === "own"} onChange={() => setMode("own")} />
              <b>Ya lo tengo</b>
              <span className="mt-1 block text-muted">Lo añade a tu plantilla con su precio de compra, sin tocar el presupuesto.</span>
            </label>
            <label className={`cursor-pointer rounded-lg border p-3 text-[13px] ${mode === "buy" ? "border-up/60 bg-up/5" : "border-line"}`}>
              <input type="radio" className="mr-2 accent-[#22c55e]" checked={mode === "buy"} onChange={() => setMode("buy")} />
              <b>Compra nueva</b>
              <span className="mt-1 block text-muted">Registra la compra y descuenta el precio (saldo: {fmtMoney(budget)}).</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio de compra (€)</label>
              <MoneyInput value={price} onChange={setPrice} required />
              {mode === "buy" && price != null && <p className={`mt-1 text-[11.5px] ${budget - price < 0 ? "text-down" : "text-dim"}`}>Saldo tras la compra: {fmtMoney(budget - price)}</p>}
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required max={todayStr()} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPicked(null)}>Cancelar</button>
            <button className={mode === "buy" ? "btn-up" : "btn-primary"} disabled={busy || full || price == null || price <= 0}>
              <UserPlus size={15} /> {mode === "buy" ? "Registrar compra" : "Añadir a mi plantilla"}
            </button>
          </div>
        </form>
      )}

      <details className="panel-inset p-4">
        <summary className="cursor-pointer text-sm font-medium">¿No aparece? Crear jugador a mano</summary>
        <form onSubmit={create} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} />
          </div>
          <div>
            <label className="label">Equipo</label>
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
              <option value="">Elige…</option>
              {TEAMS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Posición</label>
            <select className="input" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{POSITION_LABEL[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Valor actual (€)</label>
            <MoneyInput value={value} onChange={setValue} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PlayerStatus)}>
              {(Object.keys(STATUS_LABEL) as PlayerStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <button className="btn-ghost" disabled={busy}>Crear jugador</button>
          </div>
        </form>
      </details>
    </div>
  );
}
