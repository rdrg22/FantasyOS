import { NextResponse } from "next/server";
import { getRepoOrThrow } from "@/lib/services/context";
import { buildState } from "@/lib/services/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resumen de solo lectura: saldo, plantilla, recomendaciones y frescura de datos. */
export async function GET() {
  const ctx = await getRepoOrThrow().catch(() => null);
  if (!ctx) return NextResponse.json({ ok: false, error: "Sesión caducada: vuelve a iniciar sesión." }, { status: 401 });
  const { repo, workspace } = ctx;
  const s = await buildState(repo, workspace);
  return NextResponse.json({
    workspace,
    today: s.today,
    budget: s.settings.budget,
    squadValue: s.squadValue,
    squad: s.squad.map((r) => ({ id: r.entry.playerId, name: r.analysis.player.name, value: r.value, purchasePrice: r.entry.purchasePrice, pnl: r.pnl.diff, xp: r.analysis.xp })),
    nextMatchday: s.calendar.next?.matchday ?? null,
    deadline: s.calendar.next?.firstKickoff ?? null,
    recommendations: s.recommendations.map((r) => ({ action: r.action, priority: r.priority, title: r.title, price: r.price, budgetAfter: r.budget.after, confidence: r.confidence.level })),
    dataFreshness: s.dataFreshness,
  });
}
