// Tipos y utilidades comunes a todos los almacenes de datos (SQLite y Supabase).
// Este módulo no importa ningún motor de base de datos.
import type { Player, Settings } from "../domain/types";
import type { SqliteRepo } from "./repo";

export type PlayerInput = Omit<Player, "overridden" | "normName"> & { normName?: string };

export const DEFAULT_SETTINGS: Settings = {
  budget: 0,
  formation: "4-3-3",
  lineup: {},
  useCoach: false,
  maxSquadSize: 24,
  teamName: "Mi equipo",
};

export class DomainError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Fecha local (Europe/Madrid) en formato YYYY-MM-DD. */
export function today(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

type AsyncMethods<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

/** Operaciones públicas del almacén, en versión asíncrona. */
export type StoreMethods = Omit<SqliteRepo, "db" | "userId">;
export type Store = AsyncMethods<StoreMethods> & { readonly userId: string; readonly kind: "sqlite" | "supabase" };
