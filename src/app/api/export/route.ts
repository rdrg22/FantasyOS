import { NextResponse } from "next/server";
import { getRepo } from "@/lib/services/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copia de seguridad en JSON de los datos del usuario (plantilla, operaciones, ajustes, mercado). */
export async function GET() {
  const { repo, workspace } = await getRepo();
  const payload = {
    exportedAt: new Date().toISOString(),
    workspace,
    settings: repo.getSettings(),
    squad: repo.getSquad(),
    transactions: repo.getTransactions(),
    listings: repo.getListings(),
    squadValueHistory: repo.getSquadValueHistory(),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fantasy-os-${workspace}-${payload.exportedAt.slice(0, 10)}.json"`,
    },
  });
}
