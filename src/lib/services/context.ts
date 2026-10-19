import { cookies } from "next/headers";
import { openDb } from "../db/sqlite";
import { Repo } from "../db/repo";
import type { Workspace } from "../domain/types";

export const WORKSPACE_COOKIE = "fos_ws";

/**
 * Usuario actual. Hoy la app funciona con una única cuenta local; todas las tablas
 * de usuario ya llevan user_id para poder enchufar autenticación (p. ej. Supabase Auth).
 */
export function currentUserId(): string {
  return "local";
}

export async function getWorkspace(): Promise<Workspace> {
  const c = await cookies();
  return c.get(WORKSPACE_COOKIE)?.value === "demo" ? "demo" : "real";
}

export async function getRepo(): Promise<{ repo: Repo; workspace: Workspace }> {
  const workspace = await getWorkspace();
  return { repo: new Repo(openDb(workspace), currentUserId()), workspace };
}

export function repoFor(workspace: Workspace): Repo {
  return new Repo(openDb(workspace), currentUserId());
}
