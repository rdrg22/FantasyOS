import type { Formation, LineupSlot, Position } from "./types";

export function formationCounts(f: Formation): Record<"DEF" | "MED" | "DEL", number> {
  const [d, m, a] = f.split("-").map(Number);
  return { DEF: d, MED: m, DEL: a };
}

/** Huecos del once en orden de dibujo (de portería hacia delante). */
export function formationSlots(f: Formation, useCoach: boolean): LineupSlot[] {
  const c = formationCounts(f);
  const slots: LineupSlot[] = [{ slot: "POR-1", position: "POR", playerId: null }];
  (["DEF", "MED", "DEL"] as const).forEach((pos) => {
    for (let i = 1; i <= c[pos]; i++) slots.push({ slot: `${pos}-${i}`, position: pos, playerId: null });
  });
  if (useCoach) slots.push({ slot: "ENT-1", position: "ENT", playerId: null });
  return slots;
}

export function slotPosition(slot: string): Position {
  return slot.split("-")[0] as Position;
}

/**
 * Reubica una alineación guardada en una nueva formación conservando a los
 * jugadores en su línea cuando caben.
 */
export function remapLineup(
  lineup: Record<string, string | null>,
  f: Formation,
  useCoach: boolean,
): Record<string, string | null> {
  const byPos: Record<string, string[]> = {};
  for (const [slot, pid] of Object.entries(lineup)) {
    if (!pid) continue;
    const p = slotPosition(slot);
    (byPos[p] ??= []).push(pid);
  }
  const out: Record<string, string | null> = {};
  for (const s of formationSlots(f, useCoach)) {
    out[s.slot] = byPos[s.position]?.shift() ?? null;
  }
  return out;
}
