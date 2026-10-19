/** Cliente HTTP común para proveedores: timeout, reintento único y errores tipados. */

export class ProviderError extends Error {
  constructor(message: string, public kind: "network" | "http" | "parse" | "disabled" | "rate-limit" | "auth", public status?: number) {
    super(message);
  }
}

export const USER_AGENT = "FantasyOS/0.1 (asistente personal; uso no comercial; peticiones bajo demanda)";

export async function fetchText(url: string, init: { headers?: Record<string, string>; timeoutMs?: number; retries?: number } = {}): Promise<string> {
  const { headers = {}, timeoutMs = 20000, retries = 1 } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9", ...headers },
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (res.status === 429) throw new ProviderError(`Límite de peticiones alcanzado en ${new URL(url).host}. Inténtalo más tarde.`, "rate-limit", 429);
      if (res.status === 401 || res.status === 403) throw new ProviderError(`Acceso denegado por ${new URL(url).host} (HTTP ${res.status}). Revisa la clave o los permisos.`, "auth", res.status);
      if (!res.ok) throw new ProviderError(`HTTP ${res.status} en ${new URL(url).host}`, "http", res.status);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError && (e.kind === "rate-limit" || e.kind === "auth")) throw e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr instanceof ProviderError) throw lastErr;
  const cause = lastErr instanceof Error && lastErr.cause instanceof Error ? ` (${(lastErr.cause as Error & { code?: string }).code ?? ""} ${lastErr.cause.message})` : "";
  const msg = lastErr instanceof Error ? (lastErr.name === "AbortError" ? "tiempo de espera agotado" : lastErr.message + cause) : String(lastErr);
  throw new ProviderError(`No se pudo conectar con ${new URL(url).host}: ${msg}`, "network");
}

export async function fetchJson<T = unknown>(url: string, init: Parameters<typeof fetchText>[1] = {}): Promise<T> {
  const txt = await fetchText(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new ProviderError(`Respuesta no válida (JSON) de ${new URL(url).host}`, "parse");
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Decodifica las entidades HTML más comunes. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
