// Almacén local SQLite (desarrollo y uso en tu ordenador). Se carga de forma dinámica
// para que el despliegue con Supabase no necesite node:sqlite.
import { openDb } from "./sqlite";
import { SqliteRepo } from "./repo";
import type { Store } from "./common";
import type { Workspace } from "../domain/types";

/** Envuelve el repositorio síncrono en la interfaz asíncrona común. */
export function asStore(repo: SqliteRepo): Store {
  return new Proxy(repo, {
    get(target, prop) {
      if (prop === "kind") return "sqlite";
      const v = (target as unknown as Record<PropertyKey, unknown>)[prop];
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        try {
          return Promise.resolve((v as (...a: unknown[]) => unknown).apply(target, args));
        } catch (e) {
          return Promise.reject(e);
        }
      };
    },
  }) as unknown as Store;
}

export function openSqliteStore(ws: Workspace, userId: string): Store {
  return asStore(new SqliteRepo(openDb(ws), userId));
}
