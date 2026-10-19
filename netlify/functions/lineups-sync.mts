// Llama a /api/cron/daily del propio sitio (autorizado con FOS_CRON_SECRET).
async function callStep(step: string, extra: Record<string, string> = {}): Promise<{ ok: boolean; result?: { remaining?: number; failed?: string[]; message?: string } ; error?: string }> {
  const base = process.env.URL; // URL principal del sitio (la define Netlify)
  const secret = process.env.FOS_CRON_SECRET;
  if (!base || !secret) return { ok: false, error: "Faltan URL o FOS_CRON_SECRET" };
  const qs = new URLSearchParams({ step, ...extra });
  try {
    const res = await fetch(`${base}/api/cron/daily?${qs}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12_000) });
    return (await res.json()) as { ok: boolean };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Alineaciones probables 3 veces al día, por tandas (cada llamada procesa unos pocos partidos). */
export default async () => {
  const started = Date.now();
  const exclude: string[] = [];
  const log: unknown[] = [];
  while (Date.now() - started < 22_000) {
    const r = await callStep("lineups", exclude.length ? { exclude: exclude.join(",") } : {});
    log.push(r);
    exclude.push(...(r.result?.failed ?? []));
    if (!r.ok || !r.result?.remaining) break;
  }
  console.log("[lineups-sync]", JSON.stringify(log));
  return new Response("ok");
};

export const config = { schedule: "20 7,13,19 * * *" };
