import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId, storeFor, WORKSPACE_COOKIE } from "@/lib/services/context";
import { seedDemo } from "@/lib/services/demo";

export const runtime = "nodejs";

/** Cambia entre datos reales y de demostración. La demo se genera la primera vez. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Sesión caducada: vuelve a iniciar sesión." }, { status: 401 });
  const parsed = z.object({ workspace: z.enum(["real", "demo"]) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Espacio de trabajo no válido." }, { status: 400 });
  const ws = parsed.data.workspace;
  if (ws === "demo") {
    const repo = await storeFor("demo", userId);
    if (!(await repo.hasSettings())) await seedDemo(repo);
  }
  const res = NextResponse.json({ ok: true, workspace: ws });
  res.cookies.set(WORKSPACE_COOKIE, ws, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return res;
}
