const eur = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${eur.format(Math.round(n))} €`;
}

/** 12.345.678 -> "12,35M" ; 845.000 -> "845k" */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 2 })}M`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`;
  return `${sign}${Math.round(a)}`;
}

export function fmtSigned(n: number | null | undefined, compact = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = compact ? fmtCompact(Math.abs(n)) : eur.format(Math.abs(Math.round(n)));
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}${compact ? "" : " €"}`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("es-ES", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

export function pctChange(now: number | null | undefined, before: number | null | undefined): number | null {
  if (now == null || before == null || before === 0) return null;
  return ((now - before) / before) * 100;
}

export interface PnL {
  invested: number;
  current: number;
  diff: number;
  pct: number | null;
}

export function pnl(purchasePrice: number, currentValue: number | null): PnL {
  const current = currentValue ?? purchasePrice;
  return {
    invested: purchasePrice,
    current,
    diff: current - purchasePrice,
    pct: pctChange(current, purchasePrice),
  };
}
