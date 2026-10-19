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

/** Cada día a las 07:00 UTC (08:00/09:00 en Madrid): calendario, mercado, puntos y valor de plantilla. */
export default async () => {
  const out: Record<string, unknown> = {};
  for (const step of ["fixtures", "market", "points", "snapshot"]) out[step] = await callStep(step);
  console.log("[daily-sync]", JSON.stringify(out));
  return new Response("ok");
};

export const config = { schedule: "0 7 * * *" };
