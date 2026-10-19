/** Utilidades de fecha en horario de Madrid (LaLiga publica horarios locales). */

const TZ = "Europe/Madrid";

/** Desfase de Madrid respecto a UTC (minutos) en un instante dado. */
function madridOffsetMinutes(utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** "2026-10-25" + "21:00" (hora de Madrid) -> ISO UTC */
export function madridToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = madridOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000).toISOString();
}

export function fmtDateTime(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function fmtDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function addDays(date: string, n: number): string {
  const t = Date.parse(date + "T00:00:00Z") + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "hace 3 h", "hace 2 días" */
export function timeAgo(iso: string | null | undefined, ref = Date.now()): string {
  if (!iso) return "nunca";
  const diff = (ref - Date.parse(iso)) / 1000;
  if (!Number.isFinite(diff)) return "—";
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  const days = Math.round(diff / 86400);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

export function countdown(iso: string | null | undefined, ref = Date.now()): string {
  if (!iso) return "—";
  const ms = Date.parse(iso) - ref;
  if (ms <= 0) return "cerrado";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} d ${h % 24} h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h} h ${m} min`;
}
