import { NextResponse } from "next/server";
import { supabaseEnabled } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (supabaseEnabled()) {
    const { authClient } = await import("@/lib/supabase/server");
    await (await authClient()).auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
