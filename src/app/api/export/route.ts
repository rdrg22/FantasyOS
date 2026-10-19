import { NextResponse } from "next/server";
import { getRepoOrThrow } from "@/lib/services/context";
import { DomainError } from "@/lib/db/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copia de seguridad en JSON de los datos del usuario (plantilla, operaciones, ajustes, mercado). */
export async function GET() {
  try {
    const { repo, workspace } = await getRepoOrThrow();
    const [settings, squad, transactions, listings, squadValueHistory] = await Promise.all([
      repo.getSettings(),
      repo.getSquad(),
      repo.getTransactions(),
      repo.getListings(),
      repo.getSquadValueHistory(),
    ]);
    const exportedAt = new Date().toISOString();
    return new NextResponse(JSON.stringify({ exportedAt, workspace, settings, squad, transactions, listings, squadValueHistory }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="fantasy-os-${workspace}-${exportedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
}
