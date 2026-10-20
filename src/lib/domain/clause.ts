/** Nivel de protección según cuánto supera la cláusula al valor de mercado. */
export function clauseLevel(clause: number | null, value: number): { label: string; cls: string } | null {
  if (clause == null || value <= 0) return null;
  const r = clause / value;
  if (r < 1.25) return { label: "Fácil de robar", cls: "text-down" };
  if (r < 1.6) return { label: "Protección media", cls: "text-gold" };
  return { label: "Bien protegido", cls: "text-up" };
}
