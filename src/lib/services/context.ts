import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Store } from "../db/common";
import { DomainError } from "../db/common";
import type { Workspace } from "../domain/types";
import { supabaseEnabled } from "../supabase/config";

export const WORKSPACE_COOKIE = "fos_ws";
const LOCAL_USER = "local";

export async function getWorkspace(): Promise<Workspace> {
  const c = await cookies();
  return c.get(WORKSPACE_COOKIE)?.value === "demo" ? "demo" : "real";
}

/** Almacén para un usuario y espacio concretos (Supabase si está configurado; si no, SQLite local). */
export async function storeFor(workspace: Workspace, userId: string): Promise<Store> {
  if (supabaseEnabled()) {
    const [{ SupabaseStore }, { adminClient }] = await Promise.all([import("../db/supabase-store"), import("../supabase/server")]);
    return new SupabaseStore(adminClient(), userId, workspace);
  }
  const { openSqliteStore } = await import("../db/sqlite-store");
  return openSqliteStore(workspace, userId);
}

/** Usuario actual: el de Supabase Auth o, en modo local, la cuenta única "local". */
export async function currentUserId(): Promise<string | null> {
  if (!supabaseEnabled()) return LOCAL_USER;
  const { currentAuthUserId } = await import("../supabase/server");
  return currentAuthUserId();
}

/** Para páginas: si no hay sesión, redirige al login. */
export async function getRepo(): Promise<{ repo: Store; workspace: Workspace; userId: string }> {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  const workspace = await getWorkspace();
  return { repo: await storeFor(workspace, userId), workspace, userId };
}

/** Para rutas API: si no hay sesión, error 401. */
export async function getRepoOrThrow(): Promise<{ repo: Store; workspace: Workspace; userId: string }> {
  const userId = await currentUserId();
  if (!userId) throw new DomainError("Sesión caducada: vuelve a iniciar sesión.", 401);
  const workspace = await getWorkspace();
  return { repo: await storeFor(workspace, userId), workspace, userId };
}
