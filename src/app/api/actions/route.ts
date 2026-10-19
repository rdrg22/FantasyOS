import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRepo } from "@/lib/services/context";
import { ActionSchema, formatZodError, runAction } from "@/lib/services/actions";
import { DomainError } from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Punto único de escritura: POST { type: "<acción>", ...datos }. Ver docs/API.md */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  try {
    const action = ActionSchema.parse(body);
    const { repo, workspace } = await getRepo();
    const r = await runAction(repo, workspace, action);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ ok: false, error: formatZodError(e) }, { status: 400 });
    if (e instanceof DomainError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("[actions]", e);
    return NextResponse.json({ ok: false, error: "Error interno al procesar la acción." }, { status: 500 });
  }
}
